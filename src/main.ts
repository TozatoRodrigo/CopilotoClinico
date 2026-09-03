import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import * as Sentry from '@sentry/node';
import { AppModule } from './app.module';
import { SentryExceptionFilter } from './shared/filters/sentry-exception.filter';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
  });
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // F4 — 1 MB era baixo demais para os uploads que o produto já promete.
      // O schema de áudio documenta 10 MB (audio.schemas.ts) mas, em base64,
      // 10 MB viram ~13,4 MB de corpo: o limite antigo rejeitava com 413
      // ANTES de o schema ser avaliado, tornando aquele teto inalcançável. O
      // mesmo bloqueava o envio de PDFs de diretriz.
      //
      // Cada endpoint continua com teto próprio e menor (Zod + MAX_DOCUMENT_BYTES),
      // então este valor é só o teto de transporte — não uma permissão para
      // subir arquivos grandes. Todas as rotas de upload exigem autenticação e
      // passam pelo ThrottlerModule.
      bodyLimit: 16 * 1024 * 1024,
    }),
    { rawBody: true },
  );

  app.useGlobalFilters(new SentryExceptionFilter());
  app.setGlobalPrefix(process.env.API_PREFIX ?? 'v1');

  await app.register(cookie);

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3001',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Application running on port ${port}`);
}

bootstrap();
