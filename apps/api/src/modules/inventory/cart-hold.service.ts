import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Cart } from '../whatsapp-bot/cart.types';

export interface CartHoldRecord {
  stateKey: string;
  chatId: string;
  contactPhone: string | null;
  customerName?: string | null;
  items: { productId: string; nombre: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  deliveryCost?: number;
  total: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  expiryWarnSent?: boolean;
}

export interface CartHoldListItem extends CartHoldRecord {
  minutesLeft: number;
  ttlSeconds: number;
}

@Injectable()
export class CartHoldService implements OnModuleInit {
  private redis: Redis;
  private readonly keyPrefix = 'cart:hold:';
  private readonly metaPrefix = 'cart:hold:meta:';
  private readonly cartKeyPrefix = 'cart:';
  private ttlSeconds: number;
  private onChange?: (stateKey: string) => void;

  constructor(private config: ConfigService) {
    this.redis = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: parseInt(this.config.get('REDIS_PORT', '6379')),
    });
    const ttlMinutes = parseInt(this.config.get('CART_HOLD_TTL_MINUTES', '30'), 10);
    this.ttlSeconds = Math.max(60, ttlMinutes * 60);
  }

  onModuleInit() {
    // no-op; hook for future keyspace notifications
  }

  /** Optional callback when holds change (wired by RealtimeService). */
  setChangeHandler(handler: (stateKey: string) => void) {
    this.onChange = handler;
  }

  private key(stateKey: string): string {
    return `${this.keyPrefix}${stateKey}`;
  }

  private metaKey(stateKey: string): string {
    return `${this.metaPrefix}${stateKey}`;
  }

  private cartKey(stateKey: string): string {
    return `${this.cartKeyPrefix}${stateKey}`;
  }

  async syncFromCart(
    stateKey: string,
    cart: Cart,
    meta?: { chatId?: string; contactPhone?: string | null; customerName?: string | null },
  ): Promise<void> {
    if (cart.items.length === 0) {
      await this.release(stateKey);
      return;
    }

    const existing = await this.getHold(stateKey);
    const now = new Date();
    const createdAt = existing?.createdAt ?? now.toISOString();
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000).toISOString();

    const record: CartHoldRecord = {
      stateKey,
      chatId: meta?.chatId ?? stateKey,
      contactPhone: meta?.contactPhone ?? null,
      customerName: meta?.customerName ?? null,
      items: cart.items.map((i) => ({
        productId: i.productId,
        nombre: i.nombre,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      subtotal: cart.subtotal,
      deliveryCost: cart.deliveryCost,
      total: cart.total,
      createdAt,
      updatedAt: now.toISOString(),
      expiresAt,
      expiryWarnSent: false,
    };

    await this.redis.setex(this.key(stateKey), this.ttlSeconds, JSON.stringify(record));
    await this.redis.setex(
      this.metaKey(stateKey),
      this.ttlSeconds + 120,
      JSON.stringify({
        stateKey,
        chatId: record.chatId,
        contactPhone: record.contactPhone,
        customerName: record.customerName,
        total: record.total,
        itemCount: record.items.reduce((n, i) => n + i.quantity, 0),
      }),
    );
    this.onChange?.(stateKey);
  }

  async markExpiryWarnSent(stateKey: string): Promise<void> {
    const redisKey = this.key(stateKey);
    const [data, ttl] = await Promise.all([this.redis.get(redisKey), this.redis.ttl(redisKey)]);
    if (!data || ttl <= 0) return;
    const record = JSON.parse(data) as CartHoldRecord;
    record.expiryWarnSent = true;
    record.updatedAt = new Date().toISOString();
    await this.redis.setex(redisKey, ttl, JSON.stringify(record));
  }

  async listExpiredNotifyMetas(): Promise<
    Array<{
      stateKey: string;
      chatId: string;
      contactPhone: string | null;
      customerName?: string | null;
      total: number;
      itemCount: number;
    }>
  > {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', `${this.metaPrefix}*`, 'COUNT', 100);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    const expired: Array<{
      stateKey: string;
      chatId: string;
      contactPhone: string | null;
      customerName?: string | null;
      total: number;
      itemCount: number;
    }> = [];

    for (const key of keys) {
      const stateKey = key.slice(this.metaPrefix.length);
      const holdExists = await this.redis.exists(this.key(stateKey));
      if (holdExists) continue;
      const data = await this.redis.get(key);
      if (!data) continue;
      expired.push(JSON.parse(data));
    }
    return expired;
  }

  async clearExpiredCart(stateKey: string): Promise<void> {
    await this.redis.del(this.metaKey(stateKey), this.cartKey(stateKey));
    this.onChange?.(stateKey);
  }

  /** Carritos Redis sin reserva activa (hold expiró pero cart quedó). */
  async listOrphanedCartStateKeys(): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', `${this.cartKeyPrefix}*`, 'COUNT', 100);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    const orphaned: string[] = [];
    for (const key of keys) {
      if (key.startsWith(this.keyPrefix) || key.startsWith(this.metaPrefix)) continue;
      const stateKey = key.slice(this.cartKeyPrefix.length);
      if (!stateKey) continue;
      const data = await this.redis.get(key);
      if (!data) continue;
      const parsed = JSON.parse(data) as Cart;
      if (!parsed.items?.length) continue;
      const holdExists = await this.redis.exists(this.key(stateKey));
      if (!holdExists) orphaned.push(stateKey);
    }
    return orphaned;
  }

  async purgeOrphanedCarts(): Promise<number> {
    const keys = await this.listOrphanedCartStateKeys();
    for (const stateKey of keys) {
      await this.clearExpiredCart(stateKey);
    }
    return keys.length;
  }

  async release(stateKey: string): Promise<void> {
    const existed = await this.redis.del(this.key(stateKey));
    await this.redis.del(this.metaKey(stateKey));
    if (existed > 0) this.onChange?.(stateKey);
  }

  async getHold(stateKey: string): Promise<CartHoldRecord | null> {
    const data = await this.redis.get(this.key(stateKey));
    if (!data) return null;
    return JSON.parse(data) as CartHoldRecord;
  }

  async getHeldQuantity(productId: string, excludeStateKey?: string): Promise<number> {
    const holds = await this.listActiveHolds();
    let total = 0;
    for (const hold of holds) {
      if (excludeStateKey && hold.stateKey === excludeStateKey) continue;
      for (const item of hold.items ?? []) {
        if (item.productId === productId) total += item.quantity;
      }
    }
    return total;
  }

  async listActiveHolds(): Promise<CartHoldListItem[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', `${this.keyPrefix}*`, 'COUNT', 100);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');

    const results: CartHoldListItem[] = [];
    for (const key of keys) {
      if (key.startsWith(this.metaPrefix)) continue;
      const [data, ttl] = await Promise.all([this.redis.get(key), this.redis.ttl(key)]);
      if (!data || ttl <= 0) continue;
      const hold = JSON.parse(data) as CartHoldRecord;
      if (!Array.isArray(hold.items)) continue;
      results.push({
        ...hold,
        ttlSeconds: ttl,
        minutesLeft: Math.ceil(ttl / 60),
      });
    }

    return results.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }

  getTtlSeconds(): number {
    return this.ttlSeconds;
  }
}
