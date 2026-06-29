import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface OpenWASession {
  id: string;
  status: 'connected' | 'disconnected' | 'connecting' | 'qr';
  qr?: string;
}

interface SendTextPayload {
  chatId: string;
  text: string;
}

interface SendImagePayload {
  chatId: string;
  image: { url?: string; base64?: string; mimetype?: string };
  caption?: string;
}

interface SendDocumentPayload {
  chatId: string;
  document: { url?: string; base64?: string; mimetype?: string; filename?: string };
  caption?: string;
}

@Injectable()
export class OpenwaService {
  private readonly logger = new Logger(OpenwaService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly sessionId: string;
  private redis: Redis;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get('OPENWA_BASE_URL', 'http://openwa:2785');
    this.apiKey = this.config.get('OPENWA_API_KEY', '');
    this.sessionId = this.config.get('OPENWA_SESSION_ID', 'default');
    this.redis = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: parseInt(this.config.get('REDIS_PORT', '6379')),
    });
  }

  private async request<T>(path: string, method: string = 'GET', body?: any): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`OpenWA API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async getSessions(): Promise<OpenWASession[]> {
    return this.request<OpenWASession[]>('/api/sessions');
  }

  async createSession(id: string = this.sessionId): Promise<void> {
    await this.request(`/api/sessions`, 'POST', { id });
  }

  async startSession(id: string = this.sessionId): Promise<void> {
    await this.request(`/api/sessions/${id}/start`, 'POST');
  }

  async getQRCode(id: string = this.sessionId): Promise<string> {
    const data = await this.request<{ qr: string }>(`/api/sessions/${id}/qr`);
    return data.qr;
  }

  async getSessionStatus(id: string = this.sessionId): Promise<string> {
    const sessions = await this.getSessions();
    const session = sessions.find(s => s.id === id);
    return session?.status || 'unknown';
  }

  async sendText(payload: SendTextPayload): Promise<void> {
    await this.request(`/api/sessions/${this.sessionId}/messages/send-text`, 'POST', payload);
    this.logger.debug(`Sent text to ${payload.chatId}`);
  }

  async sendImage(payload: SendImagePayload): Promise<void> {
    await this.request(`/api/sessions/${this.sessionId}/messages/send-image`, 'POST', {
      chatId: payload.chatId,
      image: payload.image,
      caption: payload.caption,
    });
    this.logger.debug(`Sent image to ${payload.chatId}`);
  }

  async sendDocument(payload: SendDocumentPayload): Promise<void> {
    await this.request(`/api/sessions/${this.sessionId}/messages/send-document`, 'POST', {
      chatId: payload.chatId,
      document: payload.document,
      caption: payload.caption,
    });
    this.logger.debug(`Sent document to ${payload.chatId}`);
  }

  async sendTemplate(chatId: string, templateName: string, variables: Record<string, string>): Promise<void> {
    await this.request(`/api/sessions/${this.sessionId}/messages/send-template`, 'POST', {
      chatId,
      templateName,
      variables,
    });
  }

  verifyWebhookSignature(signature: string, payload: string): boolean {
    const secret = this.config.get('OPENWA_WEBHOOK_SECRET', '');
    const crypto = require('crypto');
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return signature === expected;
  }

  async setWebhook(sessionId: string, url: string): Promise<void> {
    await this.request(`/api/sessions/${sessionId}/webhooks`, 'POST', { url, events: ['message.received'] });
  }

  getRedisClient(): Redis {
    return this.redis;
  }
}