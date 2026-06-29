import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { WhatsappBotService } from './whatsapp-bot.service';

interface WebhookJob {
  chatId: string;
  body: string;
  from: string;
  idempotencyKey: string;
}

@Injectable()
export class WhatsappBotWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker;
  private readonly logger = new Logger(WhatsappBotWorker.name);
  private processedKeys = new Set<string>();

  constructor(
    private config: ConfigService,
    private bot: WhatsappBotService,
  ) {}

  onModuleInit() {
    this.worker = new Worker('whatsapp-messages', this.processJob.bind(this), {
      connection: {
        host: this.config.get('REDIS_HOST', 'localhost'),
        port: parseInt(this.config.get('REDIS_PORT', '6379')),
      },
      concurrency: 5,
    });

    this.worker.on('completed', (job) => {
      this.logger.debug(`Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed: ${err.message}`);
    });

    this.logger.log('WhatsApp bot worker started');
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  private async processJob(job: Job<WebhookJob>) {
    const { chatId, body, from, idempotencyKey } = job.data;

    if (this.processedKeys.has(idempotencyKey)) {
      this.logger.debug(`Duplicate message ignored: ${idempotencyKey}`);
      return;
    }

    this.processedKeys.add(idempotencyKey);
    if (this.processedKeys.size > 10000) {
      this.processedKeys.clear();
    }

    try {
      await this.bot.handleMessage(chatId, body, from);
    } catch (error: any) {
      this.logger.error(`Error processing message from ${chatId}: ${error.message}`);
      throw error;
    }
  }
}