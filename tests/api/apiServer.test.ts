import { describe, expect, it, vi } from 'vitest';
import app from '../../artifacts/api-server/src/app';
import { createSessionToken, signedState, verifySignedState } from '../../artifacts/api-server/src/lib/auth';
import { apiRequest } from '../helpers/apiRequest';
import { validWorkflowDocument } from '../helpers/fixtures';

describe('api server', () => {
  it('serves health checks and anonymous auth state', async () => {
    const health = await apiRequest(app, { method: 'GET', path: '/api/healthz' });
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok' });

    const me = await apiRequest(app, { method: 'GET', path: '/api/auth/me' });
    expect(me.status).toBe(200);
    expect(me.body.user).toBeNull();
  });

  it('creates and reads authenticated marketplace templates', async () => {
    const token = createSessionToken({ address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', displayName: 'Tester' });
    const workflow = validWorkflowDocument({ name: `Publishable ${Date.now()}` });

    const created = await apiRequest(app, {
      method: 'POST',
      path: '/api/marketplace/templates',
      headers: { authorization: `Bearer ${token}` },
      body: { name: workflow.name, description: 'A safe template', authorName: 'Public Tester', tags: ['payments', 'beta'], workflow },
    });
    expect(created.status).toBe(201);
    expect(created.body.template).toMatchObject({
      name: workflow.name,
      authorName: 'Public Tester',
      tags: ['payments', 'beta'],
    });

    const listed = await apiRequest(app, { method: 'GET', path: '/api/marketplace/templates', query: { q: workflow.name } });
    expect(listed.status).toBe(200);
    expect(listed.body.templates.some((item: { id: string }) => item.id === created.body.template.id)).toBe(true);

    const deleted = await apiRequest(app, {
      method: 'DELETE',
      path: `/api/marketplace/templates/${created.body.template.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(deleted.status).toBe(200);

    const listedAfterDelete = await apiRequest(app, { method: 'GET', path: '/api/marketplace/templates', query: { q: workflow.name } });
    expect(listedAfterDelete.body.templates.some((item: { id: string }) => item.id === created.body.template.id)).toBe(false);
  });

  it('rejects invalid marketplace publish attempts', async () => {
    const token = createSessionToken({ address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' });

    const unauthenticated = await apiRequest(app, {
      method: 'POST',
      path: '/api/marketplace/templates',
      body: { workflow: validWorkflowDocument(), tags: ['payments'] },
    });
    expect(unauthenticated.status).toBe(401);

    const badVersion = await apiRequest(app, {
      method: 'POST',
      path: '/api/marketplace/templates',
      headers: { authorization: `Bearer ${token}` },
      body: { name: 'Bad', tags: ['payments'], workflow: { version: 1 } },
    });
    expect(badVersion.status).toBe(400);
    expect(badVersion.body.error).toMatch(/v2 workflows/i);

    const batch = await apiRequest(app, {
      method: 'POST',
      path: '/api/marketplace/templates',
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: 'Batch Template',
        tags: ['payments'],
        workflow: validWorkflowDocument({
          nodes: [{ id: 'batch', type: 'BatchContainer', position: { x: 0, y: 0 }, data: { label: 'Batch', config: {} } }],
        }),
      },
    });
    expect(batch.status).toBe(400);
    expect(batch.body.error).toMatch(/Batch templates are disabled/i);

    const noTags = await apiRequest(app, {
      method: 'POST',
      path: '/api/marketplace/templates',
      headers: { authorization: `Bearer ${token}` },
      body: { name: 'No Tags', description: 'A template with no tags.', tags: [], workflow: validWorkflowDocument() },
    });
    expect(noTags.status).toBe(400);
    expect(noTags.body.error).toMatch(/at least one marketplace tag/i);

    const noDescription = await apiRequest(app, {
      method: 'POST',
      path: '/api/marketplace/templates',
      headers: { authorization: `Bearer ${token}` },
      body: { name: 'No Description', tags: ['payments'], workflow: validWorkflowDocument() },
    });
    expect(noDescription.status).toBe(400);
    expect(noDescription.body.error).toMatch(/description is required/i);

    const emptyWorkflow = await apiRequest(app, {
      method: 'POST',
      path: '/api/marketplace/templates',
      headers: { authorization: `Bearer ${token}` },
      body: { name: 'Empty', description: 'Empty graph', tags: ['payments'], workflow: validWorkflowDocument({ nodes: [], edges: [] }) },
    });
    expect(emptyWorkflow.status).toBe(400);
    expect(emptyWorkflow.body.error).toMatch(/at least one node/i);

    const unknownNode = await apiRequest(app, {
      method: 'POST',
      path: '/api/marketplace/templates',
      headers: { authorization: `Bearer ${token}` },
      body: {
        name: 'Unknown Node',
        description: 'Unsupported node type',
        tags: ['payments'],
        workflow: validWorkflowDocument({
          nodes: [{ id: 'start', type: 'MadeUpNode', position: { x: 0, y: 0 }, data: { label: 'Nope', config: {} } }],
          edges: [],
        }),
      },
    });
    expect(unknownNode.status).toBe(400);
    expect(unknownNode.body.error).toMatch(/unsupported node type/i);
  });

  it('gates the free AI workflow endpoint behind auth and server config', async () => {
    const unauthenticated = await apiRequest(app, {
      method: 'POST',
      path: '/api/ai/workflow',
      body: { prompt: 'Create a simple testnet payment flow' },
    });
    expect(unauthenticated.status).toBe(401);

    vi.stubEnv('OPENAI_API_KEY', '');
    const token = createSessionToken({ address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' });
    const notConfigured = await apiRequest(app, {
      method: 'POST',
      path: '/api/ai/workflow',
      headers: { authorization: `Bearer ${token}` },
      body: { prompt: 'Create a simple testnet payment flow' },
    });
    expect(notConfigured.status).toBe(501);
    expect(notConfigured.body.error).toMatch(/not configured/i);
  });

  it('rate-limits noisy endpoints with standard headers', async () => {
    for (let index = 0; index < 20; index += 1) {
      const response = await apiRequest(app, { method: 'GET', path: '/api/auth/xaman/start' });
      expect(response.status).toBe(501);
    }

    const limited = await apiRequest(app, { method: 'GET', path: '/api/auth/xaman/start' });
    expect(limited.status).toBe(429);
    expect(limited.headers['ratelimit-limit']).toBe('20');
    expect(limited.headers['ratelimit-remaining']).toBe('0');
    expect(limited.headers['ratelimit-reset']).toBeTruthy();
    expect(limited.body.error).toMatch(/rate limit/i);
  });

  it('sanitizes Xaman return targets and keeps sessions out of redirect URLs', async () => {
    vi.stubEnv('XAMAN_CLIENT_ID', 'client-id');
    vi.stubEnv('XAMAN_CLIENT_SECRET', 'client-secret');

    const start = await apiRequest<{ authorizationUrl: string }>(app, {
      method: 'GET',
      path: '/api/auth/xaman/start',
      query: { returnTo: 'https://evil.example/steal' },
    });
    expect(start.status).toBe(200);
    const authUrl = new URL(start.body.authorizationUrl);
    const state = verifySignedState<{ returnTo?: string }>(authUrl.searchParams.get('state') || undefined);
    expect(state?.returnTo).toBe('/');

    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ account: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', name: 'Tester' }), { status: 200 }));

    const callback = await apiRequest(app, {
      method: 'GET',
      path: '/api/auth/xaman/callback',
      query: { code: 'oauth-code', state: signedState({ returnTo: '/docs?topic=ai' }) },
    });
    expect(callback.status).toBe(302);
    const location = callback.redirectUrl || callback.headers.location || callback.headers.Location;
    expect(location).toBe('/docs?topic=ai');
    expect(String(location)).not.toContain('xrplFlowSession');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('checks free AI quota before ledger eligibility lookups', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('AI_FREE_DAILY_LIMIT', '1');
    vi.stubEnv('AI_SKIP_XRPL_ACCOUNT_CHECK', '1');
    const token = createSessionToken({ address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({
        message: 'ok',
        workflow: { name: 'Generated', nodes: [], edges: [] },
      }),
    }), { status: 200 }));

    const first = await apiRequest(app, {
      method: 'POST',
      path: '/api/ai/workflow',
      headers: { authorization: `Bearer ${token}` },
      body: { prompt: 'Create a simple query workflow' },
    });
    expect(first.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.stubEnv('AI_SKIP_XRPL_ACCOUNT_CHECK', '');
    const exhausted = await apiRequest(app, {
      method: 'POST',
      path: '/api/ai/workflow',
      headers: { authorization: `Bearer ${token}` },
      body: { prompt: 'Try another workflow' },
    });
    expect(exhausted.status).toBe(429);
    expect(exhausted.body.error).toMatch(/daily free ai limit/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('handles Xaman callback failure paths without live network calls', async () => {
    vi.stubEnv('XAMAN_CLIENT_ID', 'client-id');
    vi.stubEnv('XAMAN_CLIENT_SECRET', 'client-secret');

    const response = await apiRequest(app, {
      method: 'GET',
      path: '/api/auth/xaman/callback',
      query: { code: '', state: 'bad-state' },
    });
    expect(response.status).toBe(400);
    expect(response.text).toMatch(/Invalid Xaman OAuth callback/i);
  });
});
