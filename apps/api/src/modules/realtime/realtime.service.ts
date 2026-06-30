import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Subject } from 'rxjs';
import Redis from 'ioredis';

export type RealtimeEventType =
  | 'order.created'
  | 'order.updated'
  | 'cart.hold.updated'
  | 'stock.changed'
  | 'message.received'
  | 'message.sent';

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload?: Record<string, unknown>;
  at: string;
}

const CHANNEL = 'zent:events';

@Injectable()
export class RealtimeService implements OnModuleInit, OnModuleDestroy {
  private publisher: Redis;
  private subscriber: Redis;
  readonly events$ = new Subject<RealtimeEvent>();

  constructor(private config: ConfigService) {
    const redisOpts = {
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: parseInt(this.config.get('REDIS_PORT', '6379')),
    };
    this.publisher = new Redis(redisOpts);
    this.subscriber = new Redis(redisOpts);
  }

  onModuleInit() {
    this.subscriber.subscribe(CHANNEL).catch(() => {});
    this.subscriber.on('message', (channel, message) => {
      if (channel !== CHANNEL) return;
      try {
        const event = JSON.parse(message) as RealtimeEvent;
        this.events$.next(event);
      } catch {
        // ignore malformed
      }
    });
  }

  onModuleDestroy() {
    this.subscriber.disconnect();
    this.publisher.disconnect();
    this.events$.complete();
  }

  publish(type: RealtimeEventType, payload?: Record<string, unknown>): void {
    const event: RealtimeEvent = { type, payload, at: new Date().toISOString() };
    const json = JSON.stringify(event);
    this.publisher.publish(CHANNEL, json).catch(() => {});
    this.events$.next(event);
  }
}
