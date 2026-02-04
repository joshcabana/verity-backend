import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import crypto from 'k6/crypto';

const BASE_URL = __ENV.BASE_URL;
const STRIPE_WEBHOOK_SECRET = __ENV.STRIPE_WEBHOOK_SECRET || '';
const QUEUE_REGION = (__ENV.QUEUE_REGION || 'australiaCentral').toLowerCase();
const QUEUE_MODE = (__ENV.QUEUE_MODE || 'isolated').toLowerCase();
const USE_SIMPLE = __ENV.USE_SIMPLE === '1';
const SEED_TOKENS = __ENV.SEED_TOKENS !== '0';
const TOKENS_PER_USER = Number.parseInt(__ENV.TOKENS_PER_USER || '2', 10);

const THINK_TIME_MIN = Number.parseFloat(__ENV.THINK_TIME_MIN || '0.5');
const THINK_TIME_MAX = Number.parseFloat(__ENV.THINK_TIME_MAX || '2.0');

const TARGET_VUS = Number.parseInt(__ENV.TARGET_VUS || '10000', 10);
const RAMP_UP = __ENV.RAMP_UP || '10m';
const HOLD = __ENV.HOLD || '0m';
const RAMP_DOWN = __ENV.RAMP_DOWN || '2m';

const PROMETHEUS_URL = __ENV.PROMETHEUS_URL;
const PROMETHEUS_BEARER_TOKEN = __ENV.PROMETHEUS_BEARER_TOKEN;

const queueJoinLatency = new Trend('queue_join_latency', true);
const errorRate = new Rate('error_rate');

const PROM_QUERIES = [
  'redis_connected_clients',
  'redis_used_memory_bytes',
  'pg_stat_database_xact_commit',
  'pg_stat_database_blks_read',
];

export const options = buildOptions();

export function setup() {
  if (!BASE_URL) {
    throw new Error('BASE_URL env var is required (staging).');
  }
  if (SEED_TOKENS && !STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is required to seed tokens.');
  }
  if (PROMETHEUS_URL) {
    queryPrometheus('start');
  }
  return { baseUrl: normalizeBaseUrl(BASE_URL) };
}

export default function (data) {
  const baseUrl = data.baseUrl;
  const ctx = ensureUser(baseUrl);

  const preferences = buildPreferences();
  const joinRes = http.post(
    `${baseUrl}/queue/join`,
    JSON.stringify({ region: QUEUE_REGION, preferences }),
    {
      headers: authHeaders(ctx.accessToken),
      tags: { name: 'queue_join' },
    },
  );

  queueJoinLatency.add(joinRes.timings.duration);
  const joinOk = check(joinRes, {
    'queue join ok': (r) => r.status === 200 || r.status === 201,
  });
  errorRate.add(!joinOk);

  sleep(randomThinkTime());

  const leaveRes = http.del(`${baseUrl}/queue/leave`, null, {
    headers: authHeaders(ctx.accessToken),
    tags: { name: 'queue_leave' },
  });
  const leaveOk = check(leaveRes, {
    'queue leave ok': (r) => r.status === 200,
  });
  errorRate.add(!leaveOk);

  sleep(randomThinkTime());
}

export function teardown() {
  if (PROMETHEUS_URL) {
    queryPrometheus('end');
  }
}

function buildOptions() {
  const thresholds = {
    queue_join_latency: ['p(95)<3000'],
    http_req_duration: ['p(95)<100'],
    http_req_failed: ['rate<0.001'],
    error_rate: ['rate<0.001'],
  };

  if (USE_SIMPLE) {
    return { thresholds };
  }

  const stages = [{ duration: RAMP_UP, target: TARGET_VUS }];
  if (HOLD !== '0m' && HOLD !== '0s') {
    stages.push({ duration: HOLD, target: TARGET_VUS });
  }
  stages.push({ duration: RAMP_DOWN, target: 0 });

  return {
    stages,
    thresholds,
  };
}

function normalizeBaseUrl(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function randomThinkTime() {
  if (THINK_TIME_MAX <= THINK_TIME_MIN) {
    return THINK_TIME_MIN;
  }
  return THINK_TIME_MIN + Math.random() * (THINK_TIME_MAX - THINK_TIME_MIN);
}

function buildPreferences() {
  if (QUEUE_MODE === 'shared') {
    return { mode: 'shared' };
  }
  return {
    seed: `${__VU}-${__ITER}-${Math.floor(Math.random() * 1e9)}`,
  };
}

function authHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

let cachedUser = null;

function ensureUser(baseUrl) {
  if (cachedUser) {
    return cachedUser;
  }

  const signupRes = http.post(
    `${baseUrl}/auth/signup-anonymous`,
    JSON.stringify({}),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'auth_signup' },
    },
  );

  const signupOk = check(signupRes, {
    'signup ok': (r) => r.status === 200 || r.status === 201,
  });
  errorRate.add(!signupOk);

  const payload = signupRes.json();
  const accessToken = payload?.accessToken;
  const userId = payload?.user?.id;
  if (!accessToken || !userId) {
    throw new Error('Signup did not return accessToken/user.id');
  }

  cachedUser = { accessToken, userId };

  if (SEED_TOKENS) {
    seedTokens(baseUrl, userId, TOKENS_PER_USER);
  }

  return cachedUser;
}

function seedTokens(baseUrl, userId, tokens) {
  const payload = buildStripePayload(userId, tokens);
  const signature = signStripePayload(payload);

  const res = http.post(`${baseUrl}/webhooks/stripe`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
    tags: { name: 'stripe_webhook' },
  });

  const ok = check(res, {
    'stripe webhook ok': (r) => r.status === 200,
  });
  errorRate.add(!ok);
}

function buildStripePayload(userId, tokens) {
  const eventId = `evt_${randomId()}`;
  const sessionId = `cs_${randomId()}`;
  return JSON.stringify({
    id: eventId,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        object: 'checkout.session',
        payment_status: 'paid',
        metadata: {
          userId,
          packId: 'starter',
          tokens: String(tokens),
        },
      },
    },
  });
}

function signStripePayload(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;
  const signature = crypto.hmac('sha256', STRIPE_WEBHOOK_SECRET, signedPayload, 'hex');
  return `t=${timestamp},v1=${signature}`;
}

function randomId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function queryPrometheus(label) {
  if (!PROMETHEUS_URL) {
    return;
  }
  const baseUrl = normalizeBaseUrl(PROMETHEUS_URL);
  const headers = PROMETHEUS_BEARER_TOKEN
    ? { Authorization: `Bearer ${PROMETHEUS_BEARER_TOKEN}` }
    : {};

  for (const query of PROM_QUERIES) {
    const url = `${baseUrl}/api/v1/query?query=${encodeURIComponent(query)}`;
    const res = http.get(url, { headers, tags: { name: 'prom_query' } });
    if (res.status !== 200) {
      console.log(`[prometheus ${label}] ${query} status=${res.status}`);
      continue;
    }
    const value = res.json()?.data?.result?.[0]?.value?.[1];
    console.log(`[prometheus ${label}] ${query} value=${value ?? 'n/a'}`);
  }
}
