import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
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

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect((response) => {
        const body = response.body as {
          status?: string;
          timestamp?: string;
          uptimeSeconds?: number;
        };

        if (body.status !== 'ok') {
          throw new Error('Expected status to be ok');
        }
        if (typeof body.timestamp !== 'string') {
          throw new Error('Expected timestamp to be a string');
        }
        if (Number.isNaN(Date.parse(body.timestamp))) {
          throw new Error('Expected timestamp to be a valid ISO date');
        }
        if (typeof body.uptimeSeconds !== 'number') {
          throw new Error('Expected uptimeSeconds to be a number');
        }
        if (body.uptimeSeconds < 0) {
          throw new Error('Expected uptimeSeconds to be >= 0');
        }
      });
  });
});
