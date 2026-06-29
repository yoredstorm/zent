import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const databaseUrl = process.env.DATABASE_URL;
  const jwtSecret = process.env.JWT_SECRET;
  if (!databaseUrl) {
    logger.error('DATABASE_URL is not set — check Dokploy Environment and redeploy');
    process.exit(1);
  }
  if (!jwtSecret) {
    logger.error('JWT_SECRET is not set — check Dokploy Environment and redeploy');
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({ origin: process.env.CORS_ORIGIN || '*' });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`API running on port ${port}`);
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err?.message || err);
  process.exit(1);
});