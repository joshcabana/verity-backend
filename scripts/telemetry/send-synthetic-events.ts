import { randomUUID } from 'crypto';

const BASE_URL = process.env.BASE_URL?.trim() || 'http://localhost:3000';
const USER_JWT = process.env.USER_JWT?.trim();
const ADMIN_JWT = process.env.ADMIN_JWT?.trim() || USER_JWT;

async function main() {
  if (!USER_JWT) {
    throw new Error('USER_JWT is required');
  }
  if (!ADMIN_JWT) {
    throw new Error('ADMIN_JWT is required');
  }

  await sendClientEvent({
    platform: 'web',
    token: USER_JWT,
    name: 'queue_joined',
    properties: {
      queueKey: 'synthetic:default',
      usersSearchingSnapshot: 4,
    },
  });

  await sendClientEvent({
    platform: 'web',
    token: USER_JWT,
    name: 'queue_match_found',
    properties: {
      queueKey: 'synthetic:default',
      sessionId: `synthetic-session-${Date.now()}`,
      waitSeconds: 22,
    },
  });

  await sendClientEvent({
    platform: 'ios',
    token: USER_JWT,
    name: 'session_ended',
    properties: {
      sessionId: `synthetic-session-${Date.now()}`,
      durationSeconds: 51,
      endedBy: 'timer',
    },
  });

  await sendClientEvent({
    platform: 'android',
    token: USER_JWT,
    name: 'safety_action_taken',
    properties: {
      action: 'warn',
      actionLatencyMs: 600,
      automated: true,
    },
  });

  await post('/telemetry/synthetic/backend', ADMIN_JWT, {
    userId: 'synthetic-backend-user',
  });

  const stageGates = await get('/telemetry/stage-gates', ADMIN_JWT);
  console.log(JSON.stringify({ baseUrl: BASE_URL, stageGates }, null, 2));
}

async function sendClientEvent(input: {
  platform: 'web' | 'ios' | 'android';
  token: string;
  name: string;
  properties: Record<string, unknown>;
}) {
  const body = {
    name: input.name,
    eventSchemaVersion: 1,
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    properties: input.properties,
  };

  return post('/analytics/events', input.token, body, {
    'X-Client-Platform': input.platform,
    'X-App-Version': 'synthetic-cli',
    'X-Build-Number': '1',
    'X-Region': process.env.APP_REGION ?? 'synthetic',
  });
}

async function post(
  path: string,
  token: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST ${path} failed: ${response.status} ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function get(path: string, token: string) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${path} failed: ${response.status} ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
