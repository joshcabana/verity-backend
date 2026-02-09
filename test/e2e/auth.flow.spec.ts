import request from 'supertest';
import {
  closeTestApp,
  createTestApp,
  resetDatabase,
  resetRedis,
  type TestAppContext,
} from '../e2e.setup';

describe('Auth flow (e2e)', () => {
  jest.setTimeout(20000);
  let context: TestAppContext | null = null;

  beforeAll(async () => {
    context = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(context);
  });

  beforeEach(async () => {
    if (!context) {
      return;
    }
    await resetDatabase(context.prisma);
    await resetRedis(context.redis);
  });

  it('signs up anonymously and updates profile identifiers', async () => {
    if (!context) {
      throw new Error('Missing test context');
    }

    const signup = await request(context.app.getHttpServer())
      .post('/auth/signup-anonymous')
      .send({
        dateOfBirth: '1990-01-01',
        consents: { marketing: true },
        privacyNoticeVersion: 'v1',
        tosVersion: 'v1',
      })
      .expect(201);

    expect(signup.body).toEqual(
      expect.objectContaining({
        accessToken: expect.any(String),
        user: expect.objectContaining({
          id: expect.any(String),
        }),
      }),
    );

    const token = signup.body.accessToken as string;

    const me = await request(context.app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(me.body.id).toBe(signup.body.user.id);

    const patch = await request(context.app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'Ari',
        age: 29,
        gender: 'non-binary',
        interests: ['Travel', 'Music'],
        bio: 'Hello world',
        photos: ['https://example.com/photo-1.jpg'],
      })
      .expect(200);

    expect(patch.body.displayName).toBe('Ari');
    expect(patch.body.age).toBe(29);
    expect(patch.body.interests).toEqual(['Travel', 'Music']);

    const verifyEmail = await request(context.app.getHttpServer())
      .post('/auth/verify-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'test@example.com', code: '123456' })
      .expect(201);

    expect(verifyEmail.body.email).toBe('test@example.com');

    const verifyPhone = await request(context.app.getHttpServer())
      .post('/auth/verify-phone')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '+15555551234', code: '654321' })
      .expect(201);

    expect(verifyPhone.body.phone).toBe('+15555551234');

    const updated = await request(context.app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(updated.body.displayName).toBe('Ari');
    expect(updated.body.email).toBe('test@example.com');
    expect(updated.body.phone).toBe('+15555551234');
  });

  it('rejects profile updates without authentication', async () => {
    if (!context) {
      throw new Error('Missing test context');
    }

    await request(context.app.getHttpServer())
      .patch('/users/me')
      .send({ displayName: 'Ari' })
      .expect(401);
  });
});
