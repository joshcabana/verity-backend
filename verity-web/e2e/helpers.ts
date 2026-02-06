import type { Page, Route } from '@playwright/test';

const API_BASE = 'http://localhost:3000';

function b64url(value: string) {
  return Buffer.from(value).toString('base64url');
}

function makeJwt(sub = 'user-1') {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      sub,
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );
  return `${header}.${payload}.sig`;
}

export async function seedAuth(page: Page, sub = 'user-1') {
  const token = makeJwt(sub);
  await page.addInitScript((accessToken) => {
    window.localStorage.setItem('verity_access_token', accessToken);
  }, token);
}

function json(data: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  };
}

function pathFor(route: Route) {
  return new URL(route.request().url()).pathname;
}

function methodFor(route: Route) {
  return route.request().method();
}

export async function mockApi(page: Page) {
  await page.route(`${API_BASE}/**`, async (route) => {
    const path = pathFor(route);
    const method = methodFor(route);

    if (path === '/auth/refresh' && method === 'POST') {
      await route.fulfill(json({}, 401));
      return;
    }

    if (path === '/tokens/balance' && method === 'GET') {
      await route.fulfill(json({ tokenBalance: 5 }));
      return;
    }

    if (path === '/moderation/blocks' && method === 'GET') {
      await route.fulfill(json([]));
      return;
    }

    if (path === '/matches' && method === 'GET') {
      await route.fulfill(
        json([
          {
            id: 'match-1',
            createdAt: '2026-02-06T00:00:00.000Z',
            partner: { id: 'user-2', displayName: 'Jordan' },
          },
        ]),
      );
      return;
    }

    if (path === '/matches/match-1/messages' && method === 'GET') {
      await route.fulfill(json([]));
      return;
    }

    if (path === '/matches/match-1/messages' && method === 'POST') {
      await route.fulfill(
        json({
          id: 'msg-1',
          matchId: 'match-1',
          senderId: 'user-1',
          text: 'test',
          createdAt: '2026-02-06T00:00:00.000Z',
        }),
      );
      return;
    }

    if (path === '/moderation/reports' && method === 'POST') {
      await route.fulfill(json({ id: 'report-1', status: 'OPEN' }));
      return;
    }

    if (path === '/queue/leave' && method === 'DELETE') {
      await route.fulfill(json({ success: true }));
      return;
    }

    await route.fulfill(json({}));
  });
}
