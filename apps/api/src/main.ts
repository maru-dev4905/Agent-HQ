import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { isLoopbackHost, loadConfig } from './config.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forConfig(config),
    new FastifyAdapter(),
  );
  app.enableShutdownHooks();
  if (!isLoopbackHost(config.host)) {
    new Logger('Bootstrap').warn(
      `API is listening on ${config.host}, not loopback. It has no user authentication yet (security §5).`,
    );
  }
  await app.listen({ host: config.host, port: config.port });
}

await bootstrap();
