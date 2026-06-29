import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.create(WorkerModule);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  logger.log(`Bot Worker running on port ${port}`);
}

bootstrap();