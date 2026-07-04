import { expect, test } from '@playwright/test';

const workflowDocument = {
  version: 2,
  id: 'marketplace-template',
  name: 'Marketplace Query Template',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  nodes: [
    { id: 'start', type: 'ManualTrigger', position: { x: 0, y: 0 }, data: { label: 'Manual Trigger', config: {} } },
    { id: 'log', type: 'LogOutput', position: { x: 220, y: 0 }, data: { label: 'Log', config: { Message: 'ok' } } },
  ],
  edges: [{ id: 'start-log', source: 'start', target: 'log' }],
};

test.beforeEach(async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => {
    consoleErrors.push(error.message);
  });
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ user: { address: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', displayName: 'Tester' } }),
  }));
  await page.route('**/api/marketplace/templates', async route => {
    if (route.request().method() === 'POST') {
      const body = await route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          template: {
            id: 'published-template',
            name: body.name,
            description: body.description,
            tags: body.tags,
            authorAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
            authorName: 'Tester',
            workflow: body.workflow,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          storage: 'memory',
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        templates: [{
          id: 'marketplace-template',
          name: workflowDocument.name,
          description: 'A mocked marketplace template for browser tests.',
          tags: ['Queries', 'Beta'],
          authorAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
          authorName: 'Tester',
          workflow: workflowDocument,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }],
        storage: 'memory',
      }),
    });
  });
  await page.goto('/');
  await expect(page.getByTestId('header')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('loads the app shell and searches the node palette', async ({ page }) => {
  await expect(page.getByText('XRPL Flow')).toBeVisible();
  await expect(page.getByTestId('canvas')).toBeVisible();

  await page.getByTestId('palette-search').fill('Log Output');
  await expect(page.getByTestId('palette-item-LogOutput')).toBeVisible();
});

test('surfaces invalid workflow imports', async ({ page }) => {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('import-workflow').click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'invalid-workflow.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      version: 2,
      id: 'invalid',
      name: 'Invalid',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      nodes: [],
      edges: [],
    })),
  });

  await expect(page.getByText(/Invalid workflow: Workflow/i)).toBeVisible();
});

test('browses and publishes marketplace templates with mocked API responses', async ({ page }) => {
  await page.getByTestId('open-workflow-library').click();
  await page.getByRole('navigation').getByRole('button', { name: 'Marketplace' }).click();
  await expect(page.getByText('Marketplace Query Template')).toBeVisible();
  await expect(page.getByText(/Storage: memory fallback/i)).toBeVisible();

  page.on('dialog', async dialog => {
    await dialog.accept(dialog.message().includes('Tags') ? 'Community,Template' : 'Browser smoke publish');
  });
  await page.getByRole('button', { name: /Publish current/i }).click();

  await expect(page.getByText('Send XRP')).toBeVisible();
});
