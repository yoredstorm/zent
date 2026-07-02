import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import type { Cart } from '../whatsapp-bot/cart.types';

export interface ExpiredCartMeta {
  stateKey: string;
  chatId: string;
  contactPhone: string | null;
  customerName?: string | null;
  total: number;
  itemCount: number;
}

@Injectable()
export class AbandonedCartService {
  private readonly logger = new Logger(AbandonedCartService.name);
  private redis: Redis;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: parseInt(this.config.get('REDIS_PORT', '6379'), 10),
    });
  }

  private async readCart(stateKey: string): Promise<Cart | null> {
    const data = await this.redis.get(`cart:${stateKey}`);
    if (!data) return null;
    return JSON.parse(data) as Cart;
  }

  async snapshotFromExpiredMeta(meta: ExpiredCartMeta): Promise<void> {
    const cart = await this.readCart(meta.stateKey);
    if (!cart?.items.length) return;

    const recent = await this.prisma.abandonedCart.findFirst({
      where: {
        stateKey: meta.stateKey,
        expiredAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (recent) return;

    await this.prisma.abandonedCart.create({
      data: {
        chatId: meta.chatId,
        stateKey: meta.stateKey,
        customerName: meta.customerName ?? null,
        customerPhone: meta.contactPhone,
        itemsJson: JSON.stringify(cart.items),
        subtotal: cart.subtotal,
        deliveryCost: cart.deliveryCost ?? 0,
        total: cart.total,
      },
    });
    this.logger.log(`Abandoned cart snapshot saved → ${meta.chatId} (${cart.items.length} items)`);
  }

  async findRecoverable(chatId: string, maxAgeDays: number) {
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    return this.prisma.abandonedCart.findFirst({
      where: {
        chatId,
        recoveredAt: null,
        expiredAt: { gte: cutoff },
      },
      orderBy: { expiredAt: 'desc' },
    });
  }

  async markRecovered(id: string): Promise<void> {
    await this.prisma.abandonedCart.update({
      where: { id },
      data: { recoveredAt: new Date() },
    });
  }

  async listAbandonedCarts() {
    const rows = await this.prisma.abandonedCart.findMany({
      orderBy: { expiredAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      ...row,
      subtotal: Number(row.subtotal),
      deliveryCost: Number(row.deliveryCost),
      total: Number(row.total),
      items: JSON.parse(row.itemsJson) as unknown[],
    }));
  }

  async findPendingFollowUp(followUpHours: number) {
    const cutoff = new Date(Date.now() - followUpHours * 60 * 60 * 1000);
    return this.prisma.abandonedCart.findMany({
      where: {
        followUpSentAt: null,
        recoveredAt: null,
        expiredAt: { lt: cutoff },
      },
      orderBy: { expiredAt: 'asc' },
      take: 50,
    });
  }

  async markFollowUpSent(id: string): Promise<void> {
    await this.prisma.abandonedCart.update({
      where: { id },
      data: { followUpSentAt: new Date() },
    });
  }
}
