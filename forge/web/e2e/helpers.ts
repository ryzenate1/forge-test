import type { Page, Route } from '@playwright/test';

export async function mockSetupStatus(page: Page, required = false) {
  await page.route('**/api/v1/setup/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ required, hasAdmin: !required, appVersion: '1.0.0-test' }),
    });
  });
  // Also handle Next rewrite path /api/setup/status? Check both
  await page.route('**/api/setup/status', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ required, hasAdmin: !required, appVersion: '1.0.0-test' }),
    });
  });
}

export async function mockAuthMeUnauthenticated(page: Page) {
  await page.route('**/api/v1/auth/me', async (route: Route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthorized' }) });
  });
}

export async function mockAuthMe(page: Page, user: Record<string, unknown> = { id: 'u1', email: 'admin@example.com', role: 'admin' }) {
  await page.route('**/api/v1/auth/me', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) });
  });
}

export async function mockLoginSuccess(page: Page) {
  await page.route('**/api/v1/auth/login', async (route: Route) => {
    const body = { complete: true, token: 'test-token', user: { id: 'u1', email: 'admin@example.com', role: 'admin' } };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api/v1/auth/me', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', email: 'admin@example.com', role: 'admin' }) });
  });
}

export async function mockNodes(page: Page) {
  const nodes = [
    { id: 'node-1', uuid: 'node-1', name: 'Test Node 1', fqdn: 'node1.example.com', status: 'online', memoryMb: 16384, cpuShares: 4, diskMb: 102400, daemonBase: '/srv', baseUrl: 'http://node1:8080', scheme: 'http', behindNat: false, maintenanceMode: false },
    { id: 'node-2', uuid: 'node-2', name: 'Test Node 2', fqdn: 'node2.example.com', status: 'offline', memoryMb: 8192, cpuShares: 2, diskMb: 51200, daemonBase: '/srv', baseUrl: 'http://node2:8080', scheme: 'http', behindNat: false, maintenanceMode: false },
  ];
  await page.route('**/api/v1/nodes**', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: nodes }) });
    } else {
      await route.continue();
    }
  });
  await page.route('**/api/v1/nodes/*', async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nodes[0]) });
    } else {
      await route.continue();
    }
  });
}

export async function mockPanelHealth(page: Page) {
  await page.route('**/api/v1/health**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', checks: [], checkedAt: new Date().toISOString() }),
    });
  });
}
