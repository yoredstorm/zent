import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface OpenWASession {
  id: string;
  status: string;
  qr?: string;
}

interface SendTextPayload {
  chatId: string;
  text: string;
  sessionId?: string;
}

interface SendImagePayload {
  chatId: string;
  image: { url?: string; base64?: string; mimetype?: string };
  caption?: string;
  sessionId?: string;
}

interface SendDocumentPayload {
  chatId: string;
  document: { url?: string; base64?: string; mimetype?: string; filename?: string };
  caption?: string;
  sessionId?: string;
}

const ACTIVE_SESSION_STATUSES = new Set(['ready', 'connected', 'authenticating']);

@Injectable()
export class OpenwaService {
  private readonly logger = new Logger(OpenwaService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private cachedSessionId: string | null = null;
  private redis: Redis;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get('OPENWA_BASE_URL', 'http://openwa:2785');
    this.apiKey = this.config.get('OPENWA_API_KEY', '');
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

  /** Resuelve la sesión activa; OPENWA_SESSION_ID es opcional. */
  async resolveSessionId(): Promise<string> {
    const sessions = await this.getSessions();

    if (this.cachedSessionId && sessions.some((s) => s.id === this.cachedSessionId)) {
      return this.cachedSessionId;
    }
    this.cachedSessionId = null;

    const configured = this.config.get('OPENWA_SESSION_ID', '').trim();
    if (configured) {
      const match = sessions.find((s) => s.id === configured);
      if (match) {
        this.cachedSessionId = match.id;
        return match.id;
      }
      this.logger.warn(`OPENWA_SESSION_ID "${configured}" not found — auto-detecting session`);
    }

    const active = sessions.find((s) => ACTIVE_SESSION_STATUSES.has(s.status));
    if (active) {
      this.cachedSessionId = active.id;
      this.logger.log(`Auto-selected OpenWA session: ${active.id} (${active.status})`);
      return active.id;
    }

    if (sessions.length === 1) {
      this.cachedSessionId = sessions[0].id;
      this.logger.log(`Using sole OpenWA session: ${sessions[0].id}`);
      return sessions[0].id;
    }

    if (sessions.length > 1) {
      this.cachedSessionId = sessions[0].id;
      this.logger.warn(`No active session; using first: ${sessions[0].id}`);
      return sessions[0].id;
    }

    throw new Error('No OpenWA sessions found. Create one in the OpenWA dashboard.');
  }

  async getSessions(): Promise<OpenWASession[]> {
    return this.request<OpenWASession[]>('/api/sessions');
  }

  async createSession(id?: string): Promise<void> {
    const sessionId = id ?? (await this.resolveSessionId());
    await this.request(`/api/sessions`, 'POST', { id: sessionId });
  }

  async startSession(id?: string): Promise<void> {
    const sessionId = id ?? (await this.resolveSessionId());
    await this.request(`/api/sessions/${sessionId}/start`, 'POST');
  }

  async getQRCode(id?: string): Promise<string> {
    const sessionId = id ?? (await this.resolveSessionId());
    const data = await this.request<{ qr: string }>(`/api/sessions/${sessionId}/qr`);
    return data.qr;
  }

  async getSessionStatus(id?: string): Promise<string> {
    const sessionId = id ?? (await this.resolveSessionId());
    const sessions = await this.getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    return session?.status || 'unknown';
  }

  async sendText(payload: SendTextPayload): Promise<void> {
    const sessionId = payload.sessionId ?? (await this.resolveSessionId());
    await this.request(`/api/sessions/${sessionId}/messages/send-text`, 'POST', {
      chatId: payload.chatId,
      text: payload.text,
    });
    this.logger.debug(`Sent text to ${payload.chatId} via session ${sessionId}`);
  }

  async sendImage(payload: SendImagePayload): Promise<void> {
    const sessionId = payload.sessionId ?? (await this.resolveSessionId());
    await this.request(`/api/sessions/${sessionId}/messages/send-image`, 'POST', {
      chatId: payload.chatId,
      image: payload.image,
      caption: payload.caption,
    });
    this.logger.debug(`Sent image to ${payload.chatId} via session ${sessionId}`);
  }

  async sendDocument(payload: SendDocumentPayload): Promise<void> {
    const sessionId = payload.sessionId ?? (await this.resolveSessionId());
    await this.request(`/api/sessions/${sessionId}/messages/send-document`, 'POST', {
      chatId: payload.chatId,
      document: payload.document,
      caption: payload.caption,
    });
    this.logger.debug(`Sent document to ${payload.chatId} via session ${sessionId}`);
  }

  async sendTemplate(
    chatId: string,
    templateName: string,
    variables: Record<string, string>,
    sessionId?: string,
  ): Promise<void> {
    const sid = sessionId ?? (await this.resolveSessionId());
    await this.request(`/api/sessions/${sid}/messages/send-template`, 'POST', {
      chatId,
      templateName,
      variables,
    });
  }

  /** Comprueba que OPENWA_API_KEY del env es aceptada por OpenWA. */
  async validateApiKey(): Promise<void> {
    await this.getSessions();
  }

  verifyWebhookSignature(signature: string, payload: string): boolean {
    const secret = this.config.get('OPENWA_WEBHOOK_SECRET', '');
    const crypto = require('crypto');
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return signature === expected;
  }

  async listWebhooks(sessionId: string): Promise<{ id: string; url: string }[]> {
    return this.request(`/api/sessions/${sessionId}/webhooks`);
  }

  async ensureWebhook(): Promise<void> {
    const sessions = await this.getSessions();
    if (sessions.length === 0) {
      throw new Error('No OpenWA sessions found yet. Pair WhatsApp in the dashboard first.');
    }

    for (const session of sessions) {
      await this.ensureWebhookForSession(session.id);
    }
  }

  private async ensureWebhookForSession(sessionId: string): Promise<void> {
    const url = this.config.get(
      'OPENWA_WEBHOOK_URL',
      'http://backend-api:3000/api/webhooks/openwa',
    );
    const secret = this.config.get('OPENWA_WEBHOOK_SECRET', '');

    const existing = await this.listWebhooks(sessionId);
    const match = existing.find((w) => w.url === url);

    const payload = {
      url,
      events: ['message.received'],
      ...(secret ? { secret } : {}),
      active: true,
    };

    if (match) {
      await this.request(`/api/sessions/${sessionId}/webhooks/${match.id}`, 'PUT', payload);
      this.logger.log(`Webhook updated for session "${sessionId}": ${url}`);
      return;
    }

    await this.request(`/api/sessions/${sessionId}/webhooks`, 'POST', payload);
    this.logger.log(`Webhook registered for session "${sessionId}": ${url}`);
  }

  getRedisClient(): Redis {
    return this.redis;
  }
}
