import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { WhatsappBotService } from './whatsapp-bot.service';
import { OpenwaService } from '../openwa/openwa.service';
import { WaMessageService } from '../whatsapp-inbox/wa-message.service';
import { BotTurnLogService } from './bot-turn-log.service';
import { VendorNotifyService } from '../orders/vendor-notify.service';
import { BotRoutingService } from './bot-routing.service';

interface WebhookJob {
  chatId: string;
  body: string;
  from: string;
  senderPhone?: string;
  waSessionId?: string;
  idempotencyKey: string;
}

const FALLBACK_TEXT =
  'Disculpa, hubo un problema técnico. Intenta de nuevo en un momento o escribe *asesor* para hablar con una persona.';

@Injectable()
export class WhatsappBotWorker implements OnModuleInit, OnModuleDestroy {
  private worker: Worker;
  private readonly logger = new Logger(WhatsappBotWorker.name);
  private processedKeys = new Set<string>();

  constructor(
    private config: ConfigService,
    private bot: WhatsappBotService,
    private openwa: OpenwaService,
    private waMessages: WaMessageService,
    private turnLog: BotTurnLogService,
    private vendorNotify: VendorNotifyService,
    private botRouting: BotRoutingService,
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

  private buildStateKey(chatId: string, waSessionId?: string): string {
    return waSessionId ? `${waSessionId}::${chatId}` : chatId;
  }

  private async processJob(job: Job<WebhookJob>) {
    const { chatId, body, from, senderPhone, waSessionId, idempotencyKey } = job.data;

    if (this.processedKeys.has(idempotencyKey)) {
      this.logger.debug(`Duplicate message ignored: ${idempotencyKey}`);
      return;
    }

    try {
      await this.bot.handleMessage(chatId, body, from, waSessionId, senderPhone);
      this.processedKeys.add(idempotencyKey);
      if (this.processedKeys.size > 10000) {
        this.processedKeys.clear();
      }
    } catch (error: any) {
      const message = error?.message || String(error);
      this.logger.error(`Error processing message from ${chatId}: ${message}`);

      const stateKey = this.buildStateKey(chatId, waSessionId);
      const mode = (await this.botRouting.shouldUseAiBot()) ? 'ai' : 'legacy';
      const logId = await this.turnLog.startTurn({
        stateKey,
        chatId,
        waSessionId,
        mode,
        userMessage: body,
      });
      await this.turnLog.failTurn(logId, message.slice(0, 2000), FALLBACK_TEXT);

      try {
        await this.openwa.sendText({
          chatId,
          text: FALLBACK_TEXT,
          sessionId: waSessionId,
        });
        await this.waMessages.logSystem(chatId, FALLBACK_TEXT, {
          waSessionId,
          contactPhone: senderPhone ?? null,
        });
      } catch (sendErr: any) {
        this.logger.error(`Fallback send failed for ${chatId}: ${sendErr?.message || sendErr}`);
      }

      await this.vendorNotify.trackBotFailure({
        chatId: stateKey,
        customerPhone: senderPhone ?? null,
        error: message,
      });

      throw error;
    }
  }
}
