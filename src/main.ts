import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { corsOriginResolver } from './common/security-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: corsOriginResolver,
    credentials: true,
  });
  app.use(
    bodyParser.json({
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(
    bodyParser.urlencoded({
      extended: true,
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
