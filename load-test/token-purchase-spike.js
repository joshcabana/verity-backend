import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import crypto from 'k6/crypto';

const BASE_URL = __ENV.BASE_URL;
const STRIPE_WEBHOOK_SECRET = __ENV.STRIPE_WEBHOOK_SECRET || '';
const USE_SIMPLE = __ENV.USE_SIMPLE === '1';

const SEED_USER_COUNT = Number.parseInt(__ENV.SEED_USER_COUNT || '100', 10);
const TOKENS_PER_EVENT = Number.parseInt(__ENV.TOKENS_PER_EVENT || '5', 10);

const THINK_TIME_MIN = Number.parseFloat(__ENV.THINK_TIME_MIN || '0.05');
const THINK_TIME_MAX = Number.parseFloat(__ENV.THINK_TIME_MAX || '0.2');

const BASE_RATE = Number.parseInt(__ENV.BASE_RATE || '20', 10);
const SPIKE_RATE = Number.parseInt(__ENV.SPIKE_RATE || '400', 10);
const RAMP_UP = __ENV.RAMP_UP || '1m';
const SPIKE_HOLD = __ENV.SPIKE_HOLD || '2m';
const RAMP_DOWN = __ENV.RAMP_DOWN || '1m';
const PREALLOCATED_VUS = Number.parseInt(
  __ENV.PREALLOCATED_VUS || String(Math.min(SPIKE_RATE * 2, 5000)),
  10,
);
const MAX_VUS = Number.parseInt(
  __ENV.MAX_VUS || String(Math.min(SPIKE_RATE * 3, 10000)),
  10,
);

const PROMETHEUS_URL = __ENV.PROMETHEUS_URL;
const PROMETHEUS_BEARER_TOKEN = __ENV.PROMETHEUS_BEARER_TOKEN;

const webhookLatency = new Trend('stripe_webhook_latency', true);
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
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is required to sign webhooks.');
  }
  if (PROMETHEUS_URL) {
    queryPrometheus('start');
  }

  const baseUrl = normalizeBaseUrl(BASE_URL);
  const userIds = seedUsers(baseUrl, SEED_USER_COUNT);
  return { baseUrl, userIds };
}

export default function (data) {
  const userId = pickUserId(data.userIds);
  const payload = buildStripePayload(userId, TOKENS_PER_EVENT);
  const signature = signStripePayload(payload);

  const res = http.post(`${data.baseUrl}/webhooks/stripe`, payload, {
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
    tags: { name: 'stripe_webhook' },
  });

  webhookLatency.add(res.timings.duration);
  const ok = check(res, {
    'stripe webhook ok': (r) => r.status === 200,
  });
  errorRate.add(!ok);

  sleep(randomThinkTime());
}

export function teardown() {
  if (PROMETHEUS_URL) {
    queryPrometheus('end');
  }
}

function buildOptions() {
  const thresholds = {
    http_req_duration: ['p(95)<100'],
    http_req_failed: ['rate<0.001'],
    error_rate: ['rate<0.001'],
  };

  if (USE_SIMPLE) {
    return { thresholds };
  }

  return {
    thresholds,
    scenarios: {
      webhook_spike: {
        executor: 'ramping-arrival-rate',
        startRate: BASE_RATE,
        timeUnit: '1s',
        preAllocatedVUs: PREALLOCATED_VUS,
        maxVUs: MAX_VUS,
        stages: [
          { duration: RAMP_UP, target: SPIKE_RATE },
          { duration: SPIKE_HOLD, target: SPIKE_RATE },
          { duration: RAMP_DOWN, target: BASE_RATE },
          { duration: '1m', target: 0 },
        ],
      },
    },
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

function seedUsers(baseUrl, count) {
  const userIds = [];
  for (let i = 0; i < count; i += 1) {
    const res = http.post(
      `${baseUrl}/auth/signup-anonymous`,
      JSON.stringify({}),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'auth_signup' },
      },
    );

    const ok = check(res, {
      'signup ok': (r) => r.status === 200 || r.status === 201,
    });
    errorRate.add(!ok);

    const userId = res.json()?.user?.id;
    if (userId) {
      userIds.push(userId);
    }
  }

  if (userIds.length === 0) {
    throw new Error('Failed to seed any users for webhook spike.');
  }

  return userIds;
}

function pickUserId(userIds) {
  return userIds[Math.floor(Math.random() * userIds.length)];
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
