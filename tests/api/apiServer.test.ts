import { describe, expect, it, vi } from 'vitest';
import app from '../../artifacts/api-server/src/app';
import { createSessionToken } from '../../artifacts/api-server/src/lib/auth';
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
      body: { name: workflow.name, description: 'A safe template', tags: ['payments', 'beta'], workflow },
    });
    expect(created.status).toBe(201);
    expect(created.body.template).toMatchObject({
      name: workflow.name,
      authorName: 'Tester',
      tags: ['payments', 'beta'],
    });

    const listed = await apiRequest(app, { method: 'GET', path: '/api/marketplace/templates', query: { q: workflow.name } });
    expect(listed.status).toBe(200);
    expect(listed.body.templates.some((item: { id: string }) => item.id === created.body.template.id)).toBe(true);
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
      body: { name: 'No Tags', tags: [], workflow: validWorkflowDocument() },
    });
    expect(noTags.status).toBe(400);
    expect(noTags.body.error).toMatch(/at least one marketplace tag/i);
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
