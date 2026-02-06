import request from 'supertest';
import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  resetRedis,
  type TestAppContext,
} from './e2e.setup';

describe('Frontend monitoring ingestion (e2e)', () => {
  const originalOrigins = process.env.APP_ORIGINS;
  let context: TestAppContext | null = null;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeAll(async () => {
    process.env.APP_ORIGINS = 'https://app.verity.test';
    context = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(context);
    if (typeof originalOrigins === 'undefined') {
      delete process.env.APP_ORIGINS;
    } else {
      process.env.APP_ORIGINS = originalOrigins;
    }
  });

  beforeEach(async () => {
    infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    if (!context) {
      return;
    }
    await resetDatabase(context.prisma);
    await resetRedis(context.redis);
  });

  afterEach(() => {
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('accepts valid web vitals payload from allowed origin', async () => {
    const response = await request(context!.app.getHttpServer())
      .post('/monitoring/web-vitals')
      .set('Origin', 'https://app.verity.test')
      .send({
        name: 'LCP',
        value: 2450.6,
        id: 'vital-1',
        rating: 'good',
        timestamp: Date.now(),
        path: '/home',
      })
      .expect(202);

    expect(response.body).toEqual({ accepted: true });
    expect(infoSpy).toHaveBeenCalled();
  });

  it('rejects invalid web vitals payload', async () => {
    await request(context!.app.getHttpServer())
      .post('/monitoring/web-vitals')
      .set('Origin', 'https://app.verity.test')
      .send({
        name: 'INVALID',
        value: 1,
        id: 'vital-2',
      })
      .expect(400);
  });

  it('accepts valid frontend error payload', async () => {
    const response = await request(context!.app.getHttpServer())
      .post('/monitoring/frontend-errors')
      .set('Origin', 'https://app.verity.test')
      .send({
        type: 'error',
        message: 'Chunk load failed',
        source: 'main.js',
        line: 21,
        column: 8,
        path: '/chat/m1',
        timestamp: Date.now(),
      })
      .expect(202);

    expect(response.body).toEqual({ accepted: true });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('rejects disallowed origins', async () => {
    await request(context!.app.getHttpServer())
      .post('/monitoring/frontend-errors')
      .set('Origin', 'https://attacker.example')
      .send({
        type: 'unhandledrejection',
        reason: 'promise rejected',
      })
      .expect(401);
  });
});
