import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import type { CartItem, Cart } from './cart.types';

export type { CartItem, Cart } from './cart.types';

@Injectable()
export class CartService {
  private redis: Redis;
  private readonly ttlSeconds: number;
  private deliveryFeeCache: { value: number; expiresAt: number } | null = null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.redis = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: parseInt(this.config.get('REDIS_PORT', '6379')),
    });
    const ttlMinutes = parseInt(this.config.get('CART_HOLD_TTL_MINUTES', '30'), 10);
    this.ttlSeconds = Math.max(60, ttlMinutes * 60);
  }

  getTtlSeconds(): number {
    return this.ttlSeconds;
  }

  private async getDeliveryFlatFee(): Promise<number> {
    if (this.deliveryFeeCache && Date.now() < this.deliveryFeeCache.expiresAt) {
      return this.deliveryFeeCache.value;
    }
    const store = await this.prisma.storeSettings.findFirst();
    const value = store?.deliveryFlatFee != null ? Number(store.deliveryFlatFee) : 0;
    this.deliveryFeeCache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  }

  private async recalculate(cart: Cart): Promise<void> {
    cart.subtotal = cart.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    if (cart.items.length === 0) {
      cart.deliveryCost = 0;
      cart.total = 0;
      return;
    }
    cart.deliveryCost = await this.getDeliveryFlatFee();
    cart.total = cart.subtotal + cart.deliveryCost;
  }

  private emptyCart(): Cart {
    return { items: [], subtotal: 0, deliveryCost: 0, total: 0 };
  }

  async getCart(chatId: string): Promise<Cart> {
    const key = `cart:${chatId}`;
    const data = await this.redis.get(key);
    if (!data) return this.emptyCart();
    const cart = JSON.parse(data) as Cart;
    if (cart.deliveryCost == null) cart.deliveryCost = 0;
    await this.recalculate(cart);
    const ttl = await this.redis.ttl(key);
    if (ttl > 0) {
      await this.redis.setex(key, ttl, JSON.stringify(cart));
    }
    return cart;
  }

  async addItem(chatId: string, item: CartItem): Promise<Cart> {
    const cart = await this.getCart(chatId);
    const existing = cart.items.find((i) => i.productId === item.productId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      cart.items.push(item);
    }
    await this.recalculate(cart);
    await this.redis.setex(`cart:${chatId}`, this.ttlSeconds, JSON.stringify(cart));
    return cart;
  }

  async removeItem(chatId: string, productId: string): Promise<Cart> {
    const cart = await this.getCart(chatId);
    cart.items = cart.items.filter((i) => i.productId !== productId);
    await this.recalculate(cart);
    await this.redis.setex(`cart:${chatId}`, this.ttlSeconds, JSON.stringify(cart));
    return cart;
  }

  async clearCart(chatId: string): Promise<void> {
    await this.redis.del(`cart:${chatId}`);
  }

  async updateQuantity(chatId: string, productId: string, quantity: number): Promise<Cart> {
    const cart = await this.getCart(chatId);
    const item = cart.items.find((i) => i.productId === productId);
    if (item) {
      item.quantity = quantity;
      if (item.quantity <= 0) {
        cart.items = cart.items.filter((i) => i.productId !== productId);
      }
    }
    await this.recalculate(cart);
    await this.redis.setex(`cart:${chatId}`, this.ttlSeconds, JSON.stringify(cart));
    return cart;
  }
}
