import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const REFRESH_COOKIE_NAME = 'refresh_token';

function extractRefreshCookie(res: request.Response): string {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) {
    throw new Error('Missing set-cookie header');
  }

  const cookie = setCookie.find((entry: string) =>
    entry.startsWith(`${REFRESH_COOKIE_NAME}=`),
  );

  if (!cookie) {
    throw new Error('Missing refresh_token cookie');
  }

  return cookie.split(';')[0];
}

describe('Auth refresh (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterEach(async () => {
    await app.close();
  });

  it('rotates refresh token and revokes reused tokens', async () => {
    const signupRes = await request(app.getHttpServer())
      .post('/auth/signup-anonymous')
      .expect(201);

    expect(signupRes.body.accessToken).toEqual(expect.any(String));
    const refreshCookie = extractRefreshCookie(signupRes);

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);

    expect(refreshRes.body.accessToken).toEqual(expect.any(String));
    const rotatedCookie = extractRefreshCookie(refreshRes);
    expect(rotatedCookie).not.toEqual(refreshCookie);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', rotatedCookie)
      .expect(401);
  });
});
