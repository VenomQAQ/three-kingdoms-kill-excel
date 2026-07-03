import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.enableCors({
    origin: env.corsOrigins,
    credentials: true,
  });
  app.use(cookieParser());
  await app.listen(env.port);
  console.log(`[server] listening on http://localhost:${env.port}`);
  console.log(`[server] sqlite = ${env.sqlitePath}`);
  console.log(`[server] sandboxEnabled = ${env.sandboxEnabled}, debugClock = ${env.debugClockEnabled}`);
}

bootstrap();
