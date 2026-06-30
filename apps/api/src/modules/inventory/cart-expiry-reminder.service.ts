import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CartHoldService } from './cart-hold.service';
import { OpenwaService } from '../openwa/openwa.service';
import { parseWaConversationId } from '../whatsapp-inbox/wa-conversation.util';

@Injectable()
export class CartExpiryReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CartExpiryReminderService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private config: ConfigService,
    private cartHold: CartHoldService,
    private openwa: OpenwaService,
  ) {}

  onModuleInit() {
    if (this.config.get('WORKER_MODE', '') !== 'true') {
      this.logger.log('Cart expiry reminders disabled (not bot-worker)');
      return;
    }

    const intervalMs = parseInt(this.config.get('CART_EXPIRY_CHECK_INTERVAL_SEC', '60'), 10) * 1000;
    this.timer = setInterval(() => void this.tick(), Math.max(15_000, intervalMs));
    this.logger.log(`Cart expiry reminders enabled (every ${Math.max(15, intervalMs / 1000)}s)`);
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private get warnMinutes(): number {
    return Math.max(1, parseInt(this.config.get('CART_HOLD_WARN_MINUTES', '5'), 10));
  }

  private get storeName(): string {
    return this.config.get('STORE_NAME', 'Zent').trim() || 'Zent';
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.sendExpiryWarnings();
      await this.sendExpiredNotices();
    } catch (err) {
      this.logger.warn(`Cart expiry tick failed: ${err}`);
    } finally {
      this.running = false;
    }
  }

  private async sendExpiryWarnings() {
    const holds = await this.cartHold.listActiveHolds();
    for (const hold of holds) {
      if (hold.expiryWarnSent) continue;
      if (hold.minutesLeft > this.warnMinutes) continue;

      const { waSessionId } = parseWaConversationId(hold.stateKey);
      const nombre = hold.customerName?.trim();
      const saludo = nombre ? `Hola *${nombre}*, ` : '';

      const text =
        `${saludo}⏰ *Tu carrito en ${this.storeName} está por vencer*\n\n` +
        `Tienes *${hold.items.reduce((n, i) => n + i.quantity, 0)}* producto(s) reservados por *S/ ${Number(hold.total).toFixed(2)}*.\n` +
        `La reserva expira en unos *${hold.minutesLeft} min*.\n\n` +
        `Para confirmar tu pedido escribe *menu* → *Ver mi carrito* → *Confirmar pedido*.\n\n` +
        `Si no confirmas, liberaremos el stock reservado.`;

      try {
        await this.openwa.sendText({
          chatId: hold.chatId,
          text,
          sessionId: waSessionId ?? undefined,
          source: 'bot',
        });
        await this.cartHold.markExpiryWarnSent(hold.stateKey);
        this.logger.log(`Cart expiry warning sent → ${hold.chatId} (${hold.minutesLeft} min left)`);
      } catch (err) {
        this.logger.warn(`Cart expiry warning failed for ${hold.stateKey}: ${err}`);
      }
    }
  }

  private async sendExpiredNotices() {
    const expired = await this.cartHold.listExpiredNotifyMetas();
    for (const meta of expired) {
      const { waSessionId } = parseWaConversationId(meta.stateKey);
      const nombre = meta.customerName?.trim();
      const saludo = nombre ? `Hola *${nombre}*, ` : '';

      const text =
        `${saludo}🛒 *Tu carrito en ${this.storeName} expiró*\n\n` +
        `Las *${meta.itemCount}* unidad(es) que tenías reservadas (*S/ ${Number(meta.total).toFixed(2)}*) ya no están apartadas.\n\n` +
        `Si aún deseas comprar, escribe *menu* para armar un nuevo pedido.`;

      try {
        await this.openwa.sendText({
          chatId: meta.chatId,
          text,
          sessionId: waSessionId ?? undefined,
          source: 'bot',
        });
        this.logger.log(`Cart expired notice sent → ${meta.chatId}`);
      } catch (err) {
        this.logger.warn(`Cart expired notice failed for ${meta.stateKey}: ${err}`);
      } finally {
        await this.cartHold.clearExpiredCart(meta.stateKey);
      }
    }
  }
}
