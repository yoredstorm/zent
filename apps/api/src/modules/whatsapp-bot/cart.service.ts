import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import type { CartItem, Cart } from './cart.types';

export type { CartItem, Cart } from './cart.types';

@Injectable()
export class CartService {
  private redis: Redis;
  private readonly TTL = 48 * 60 * 60;

  constructor(private config: ConfigService) {
    this.redis = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: parseInt(this.config.get('REDIS_PORT', '6379')),
    });
  }

  async getCart(chatId: string): Promise<Cart> {
    const data = await this.redis.get(`cart:${chatId}`);
    if (!data) return { items: [], subtotal: 0, total: 0 };
    return JSON.parse(data);
  }

  async addItem(chatId: string, item: CartItem): Promise<Cart> {
    const cart = await this.getCart(chatId);
    const existing = cart.items.find(i => i.productId === item.productId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      cart.items.push(item);
    }
    cart.subtotal = cart.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    cart.total = cart.subtotal;
    await this.redis.setex(`cart:${chatId}`, this.TTL, JSON.stringify(cart));
    return cart;
  }

  async removeItem(chatId: string, productId: string): Promise<Cart> {
    const cart = await this.getCart(chatId);
    cart.items = cart.items.filter(i => i.productId !== productId);
    cart.subtotal = cart.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    cart.total = cart.subtotal;
    await this.redis.setex(`cart:${chatId}`, this.TTL, JSON.stringify(cart));
    return cart;
  }

  async clearCart(chatId: string): Promise<void> {
    await this.redis.del(`cart:${chatId}`);
  }

  async updateQuantity(chatId: string, productId: string, quantity: number): Promise<Cart> {
    const cart = await this.getCart(chatId);
    const item = cart.items.find(i => i.productId === productId);
    if (item) {
      item.quantity = quantity;
      if (item.quantity <= 0) {
        cart.items = cart.items.filter(i => i.productId !== productId);
      }
    }
    cart.subtotal = cart.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    cart.total = cart.subtotal;
    await this.redis.setex(`cart:${chatId}`, this.TTL, JSON.stringify(cart));
    return cart;
  }
}