import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AbandonedCartService } from './abandoned-cart.service';
import { OpenwaService } from '../openwa/openwa.service';
import { parseWaConversationId } from '../whatsapp-inbox/wa-conversation.util';

@Injectable()
export class AbandonedCartFollowupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AbandonedCartFollowupService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private isWorker = false;

  constructor(
    private config: ConfigService,
    private abandonedCart: AbandonedCartService,
    private openwa: OpenwaService,
  ) {}

  onModuleInit() {
    this.isWorker = this.config.get('WORKER_MODE', '') === 'true';
    const intervalMs = parseInt(this.config.get('CART_EXPIRY_CHECK_INTERVAL_SEC', '60'), 10) * 1000;
    this.timer = setInterval(() => void this.tick(), Math.max(15_000, intervalMs));
    this.logger.log(
      `Abandoned cart follow-up started (worker=${this.isWorker}, every ${Math.max(15, intervalMs / 1000)}s)`,
    );
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private get followUpHours(): number {
    return Math.max(1, parseInt(this.config.get('ABANDONED_CART_FOLLOWUP_HOURS', '2'), 10));
  }

  private get recoveryDays(): number {
    return Math.max(1, parseInt(this.config.get('ABANDONED_CART_RECOVERY_DAYS', '7'), 10));
  }

  private get storeName(): string {
    return this.config.get('STORE_NAME', 'Zent').trim() || 'Zent';
  }

  private async tick() {
    if (this.running || !this.isWorker) return;
    this.running = true;
    try {
      await this.sendFollowUps();
    } catch (err) {
      this.logger.warn(`Abandoned cart follow-up tick failed: ${err}`);
    } finally {
      this.running = false;
    }
  }

  private async sendFollowUps() {
    const pending = await this.abandonedCart.findPendingFollowUp(this.followUpHours);
    for (const row of pending) {
      const { waSessionId } = parseWaConversationId(row.stateKey);
      const nombre = row.customerName?.trim();
      const saludo = nombre ? `Hola *${nombre}*, ` : '';
      const total = Number(row.total).toFixed(2);

      const text =
        `${saludo}🛒 Dejaste productos en tu carrito en *${this.storeName}* (S/ ${total}).\n\n` +
        `Para retomarlo escribe *RETOMAR*\n` +
        `Válido por ${this.recoveryDays} días.`;

      try {
        await this.openwa.sendText({
          chatId: row.chatId,
          text,
          sessionId: waSessionId ?? undefined,
          source: 'bot',
        });
        await this.abandonedCart.markFollowUpSent(row.id);
        this.logger.log(`Abandoned cart follow-up sent → ${row.chatId}`);
      } catch (err) {
        this.logger.warn(`Abandoned cart follow-up failed for ${row.id}: ${err}`);
      }
    }
  }
}
