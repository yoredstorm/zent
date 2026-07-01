import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
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
  source?: 'bot' | 'agent';
}

interface SendImagePayload {
  chatId: string;
  image: { url?: string; base64?: string; mimetype?: string };
  caption?: string;
  sessionId?: string;
  source?: 'bot' | 'agent';
}

interface SendDocumentPayload {
  chatId: string;
  document: { url?: string; base64?: string; mimetype?: string; filename?: string };
  caption?: string;
  sessionId?: string;
  source?: 'bot' | 'agent';
}

export interface OpenWaChatMessage {
  id?: string;
  from?: string;
  body?: string;
  text?: string;
  type?: string;
  fromMe?: boolean;
  hasMedia?: boolean;
  caption?: string;
  mediaUrl?: string;
  mimetype?: string;
  mimeType?: string;
  timestamp?: string;
  media?: { url?: string; mimetype?: string; mimeType?: string };
}

const ACTIVE_SESSION_STATUSES = new Set([
  'ready',
  'connected',
  'CONNECTED',
  'authenticating',
  'CONNECTING',
]);

const QR_PENDING_STATUSES = new Set([
  'qr_ready',
  'SCAN_QR',
  'INITIALIZING',
  'initializing',
  'qr_pending',
  'connecting',
  'CONNECTING',
  'created',
]);

const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

import { WaMessageService } from '../whatsapp-inbox/wa-message.service';

@Injectable()
export class OpenwaService {
  private readonly logger = new Logger(OpenwaService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private cachedSessionId: string | null = null;
  private redis: Redis;

  constructor(
    private config: ConfigService,
    @Inject(forwardRef(() => WaMessageService))
    private waMessages: WaMessageService,
  ) {
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
      const detail = await response.text().catch(() => '');
      const msg = detail ? `${response.status} ${response.statusText}: ${detail.slice(0, 300)}` : `${response.status} ${response.statusText}`;
      throw new Error(`OpenWA API error: ${msg}`);
    }
    return response.json();
  }

  /** OpenWA v2 envuelve respuestas en { success, data }. */
  private unwrapData<T>(result: unknown): T | null {
    if (result && typeof result === 'object' && 'data' in (result as object)) {
      const wrapped = result as { success?: boolean; data: T };
      if (wrapped.success === false) return null;
      return wrapped.data;
    }
    return null;
  }

  private normalizeStatus(status: string | undefined): string {
    return (status || 'unknown').toLowerCase();
  }

  isConnectedStatus(status: string | undefined): boolean {
    if (!status) return false;
    if (ACTIVE_SESSION_STATUSES.has(status)) return true;
    const s = this.normalizeStatus(status);
    return s === 'ready' || s === 'connected' || s === 'authenticated';
  }

  isQrPendingStatus(status: string | undefined): boolean {
    const s = status || '';
    return QR_PENDING_STATUSES.has(s) || QR_PENDING_STATUSES.has(this.normalizeStatus(s));
  }

  private extractQrPayload(data: unknown): string {
    if (!data || typeof data !== 'object') return '';
    const d = data as Record<string, string | undefined>;
    return d.image || d.qrCode || d.qr || d.code || '';
  }

  private needsSessionStart(status: string | undefined): boolean {
    const s = this.normalizeStatus(status);
    return s === 'created' || s === 'disconnected' || s === 'failed';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** OpenWA @IsUrl() rejects hostnames without TLD (e.g. backend-api). Read our uploads from disk. */
  private tryLoadLocalUpload(url: string): { base64: string; mimetype: string; filename: string } | null {
    const match = url.match(/\/uploads\/(pdf|images)\/([^/?#]+)$/i);
    if (!match) return null;

    const [, folder, filename] = match;
    const uploadsDir = this.config.get('UPLOADS_DIR', './uploads');
    const filepath = path.join(uploadsDir, folder, filename);
    if (!fs.existsSync(filepath)) {
      this.logger.warn(`Upload file not found on disk: ${filepath}`);
      return null;
    }

    const ext = path.extname(filename).toLowerCase();
    const mimetype =
      MIME_BY_EXT[ext] || (folder === 'pdf' ? 'application/pdf' : 'application/octet-stream');
    const base64 = fs.readFileSync(filepath).toString('base64');
    return { base64, mimetype, filename };
  }

  /** Prefer public URL for remote fetch; internal hostnames fail OpenWA @IsUrl() validation. */
  private resolveMediaUrl(url?: string): string | undefined {
    if (!url) return undefined;
    const publicBase = this.config.get('PUBLIC_API_URL', '').replace(/\/$/, '');
    if (publicBase && url.startsWith(`${publicBase}/`)) {
      return url;
    }
    const internalBase = this.config.get('INTERNAL_API_URL', 'http://backend-api:3000/api').replace(/\/$/, '');
    if (url.startsWith('/api/uploads/')) {
      return `${publicBase || internalBase}${url.slice('/api'.length)}`;
    }
    if (internalBase && url.startsWith(`${internalBase}/`)) {
      return publicBase ? url.replace(internalBase, publicBase) : url;
    }
    return url;
  }

  private buildMediaBody(
    chatId: string,
    source: { url?: string; base64?: string; mimetype?: string; filename?: string },
    caption?: string,
  ): Record<string, string> {
    const body: Record<string, string> = { chatId };

    if (source.url) {
      const local = this.tryLoadLocalUpload(source.url);
      if (local) {
        body.base64 = local.base64;
        body.mimetype = source.mimetype || local.mimetype;
        body.filename = source.filename || local.filename;
      } else {
        body.url = this.resolveMediaUrl(source.url)!;
        if (source.mimetype) body.mimetype = source.mimetype;
        if (source.filename) body.filename = source.filename;
      }
    } else if (source.base64) {
      body.base64 = source.base64;
      if (source.mimetype) body.mimetype = source.mimetype;
      if (source.filename) body.filename = source.filename;
    }

    if (!body.url && !body.base64) {
      throw new Error('Media source must provide url or base64');
    }
    if (body.base64 && !body.mimetype) {
      throw new Error('mimetype is required when sending base64 media');
    }
    if (body.url && !body.filename && source.url) {
      try {
        body.filename = decodeURIComponent(new URL(source.url).pathname.split('/').pop() || 'file');
      } catch {
        /* optional */
      }
    }
    if (caption) body.caption = caption;
    return body;
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

    const active = sessions.find((s) => ACTIVE_SESSION_STATUSES.has(s.status) || this.isConnectedStatus(s.status));
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
    const result = await this.request<unknown>('/api/sessions');
    const data = this.unwrapData<OpenWASession[]>(result);
    if (Array.isArray(data)) return data;
    if (Array.isArray(result)) return result as OpenWASession[];
    return [];
  }

  /**
   * Crea una sesion de WhatsApp para vincular por QR (OpenWA API v2).
   * Requiere `name`; el id es opcional y lo genera OpenWA si no se envia.
   */
  async createSession(opts?: { name?: string; id?: string }): Promise<OpenWASession> {
    const name = opts?.name?.trim() || this.config.get('STORE_NAME', 'Zent') || 'Zent';
    const body: Record<string, string> = { name };
    const configuredId = opts?.id?.trim() || this.config.get('OPENWA_SESSION_ID', '').trim();
    if (configuredId) body.id = configuredId;

    const result = await this.request<unknown>('/api/sessions', 'POST', body);
    const session = this.unwrapData<OpenWASession>(result) ?? (result as OpenWASession);
    if (!session?.id) {
      throw new Error('OpenWA no devolvio id de sesion al crear');
    }
    this.cachedSessionId = session.id;
    return session;
  }

  /** Inicia el motor WhatsApp de una sesion (OpenWA v2: POST /start). */
  async startSession(id?: string): Promise<OpenWASession | null> {
    const sessionId = id ?? (await this.resolveSessionId());
    try {
      const result = await this.request<unknown>(`/api/sessions/${sessionId}/start`, 'POST');
      const session =
        this.unwrapData<OpenWASession>(result) ?? (result as OpenWASession);
      if (session?.id) {
        this.cachedSessionId = session.id;
        return session;
      }
      return null;
    } catch (err: any) {
      this.logger.debug(`startSession skipped: ${err?.message || err}`);
      return null;
    }
  }

  async getQRCode(id?: string): Promise<string> {
    const sessionId = id ?? (await this.resolveSessionId());
    const result = await this.request<unknown>(`/api/sessions/${sessionId}/qr`);
    const data = this.unwrapData<Record<string, string>>(result) ?? (result as Record<string, string>);
    return this.extractQrPayload(data);
  }

  /** Intenta obtener el QR una sola vez (sin bloquear la peticion HTTP). */
  async tryGetQROnce(sessionId: string): Promise<string> {
    try {
      return await this.getQRCode(sessionId);
    } catch {
      return '';
    }
  }

  /** Espera hasta que OpenWA exponga un QR para la sesion (polling). Solo usar fuera del request HTTP. */
  async waitForQR(sessionId: string, attempts = 20, delayMs = 2000): Promise<string> {
    for (let i = 0; i < attempts; i++) {
      try {
        const qr = await this.getQRCode(sessionId);
        if (qr) return qr;
      } catch {
        /* sesion aun inicializando */
      }
      if (i < attempts - 1) await this.sleep(delayMs);
    }
    return '';
  }

  /**
   * Garantiza una sesion para vincular por QR.
   * Por defecto responde rapido (sin esperar QR); el cliente debe hacer polling a /qr.
   */
  async ensureSessionForPairing(
    opts?: { name?: string },
    waitForQr = false,
  ): Promise<{ sessionId: string; qr: string; status: string }> {
    const sessions = await this.getSessions();
    const configuredId = this.config.get('OPENWA_SESSION_ID', '').trim();

    const pickExisting = (): OpenWASession | undefined => {
      if (configuredId) {
        const match = sessions.find((s) => s.id === configuredId);
        if (match) return match;
      }
      const pending = sessions.find((s) => this.isQrPendingStatus(s.status));
      if (pending) return pending;
      if (sessions.length === 1) return sessions[0];
      return sessions[0];
    };

    const finish = async (session: OpenWASession) => {
      this.cachedSessionId = session.id;
      let status = session.status || 'unknown';

      if (this.needsSessionStart(status)) {
        if (waitForQr) {
          const started = await this.startSession(session.id);
          if (started?.status) status = started.status;
        } else {
          void this.startSession(session.id);
        }
      }

      let qr = session.qr || '';
      if (!qr) {
        qr = waitForQr
          ? await this.waitForQR(session.id, 15, 2000)
          : await this.tryGetQROnce(session.id);
      }
      return { sessionId: session.id, qr, status };
    };

    const existing = pickExisting();
    if (existing) {
      return finish(existing);
    }

    try {
      const session = await this.createSession({ name: opts?.name });
      return finish(session);
    } catch (err: any) {
      // Sesion ya existia o nombre duplicado: reutilizar la lista actualizada.
      this.logger.debug(`createSession retry after: ${err?.message || err}`);
      const retry = await this.getSessions();
      if (retry.length > 0) {
        return finish(retry[0]);
      }
      throw err;
    }
  }

  async getSessionStatus(id?: string): Promise<string> {
    const sessionId = id ?? (await this.resolveSessionId());
    const sessions = await this.getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    return session?.status || 'unknown';
  }

  /** Estado normalizado para UI (connected | qr_pending | disconnected | ...). */
  mapStatusForUi(rawStatus: string): string {
    if (this.isConnectedStatus(rawStatus)) return 'connected';
    if (this.isQrPendingStatus(rawStatus)) return 'qr_pending';
    const s = this.normalizeStatus(rawStatus);
    if (s === 'disconnected' || s === 'failed') return 'disconnected';
    if (s === 'error') return 'authenticating';
    return s;
  }

  /** Resuelve @lid → teléfono vía API OpenWA (best-effort). */
  async resolveContactPhone(contactId: string, sessionId?: string): Promise<string | null> {
    const sid = sessionId ?? (await this.resolveSessionId());
    const encoded = encodeURIComponent(contactId);
    try {
      const data = await this.request<{ phone: string | null }>(
        `/api/sessions/${sid}/contacts/${encoded}/phone`,
      );
      return data.phone?.trim() || null;
    } catch (err: any) {
      this.logger.warn(`Could not resolve phone for ${contactId}: ${err?.message}`);
      return null;
    }
  }

  /** Nombre/alias de WhatsApp (pushName) vía API OpenWA. */
  async resolveContactName(contactId: string, sessionId?: string): Promise<string | null> {
    const sid = sessionId ?? (await this.resolveSessionId());
    const encoded = encodeURIComponent(contactId);
    try {
      const data = await this.request<{ name?: string; pushName?: string; shortName?: string }>(
        `/api/sessions/${sid}/contacts/${encoded}`,
      );
      return data.pushName?.trim() || data.name?.trim() || data.shortName?.trim() || null;
    } catch (err: any) {
      this.logger.debug(`Could not resolve contact name for ${contactId}: ${err?.message}`);
      return null;
    }
  }

  async getChatMessages(
    sessionId: string,
    chatId: string,
    opts?: { limit?: number; before?: string },
  ): Promise<OpenWaChatMessage[]> {
    const encoded = encodeURIComponent(chatId);
    const params = new URLSearchParams();
    if (opts?.limit) params.set('limit', String(opts.limit));
    if (opts?.before) params.set('before', opts.before);
    const qs = params.toString();
    const path = `/api/sessions/${sessionId}/chats/${encoded}/messages${qs ? `?${qs}` : ''}`;
    const result = await this.request<
      OpenWaChatMessage[] | { success?: boolean; data: OpenWaChatMessage[] }
    >(path);
    return this.unwrapMessageList(result);
  }

  private unwrapMessageList(
    result: OpenWaChatMessage[] | { success?: boolean; data: OpenWaChatMessage[] },
  ): OpenWaChatMessage[] {
    if (Array.isArray(result)) return result;
    if (result && Array.isArray(result.data)) return result.data;
    return [];
  }

  /** Valida que el número tenga WhatsApp y devuelve el chatId correcto (@c.us). */
  async resolveChatIdForPhone(phone: string, sessionId?: string): Promise<string | null> {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 9) return null;
    const sid = sessionId ?? (await this.resolveSessionId());
    try {
      const data = await this.request<{ exists?: boolean; chatId?: string; data?: { exists?: boolean; chatId?: string } }>(
        `/api/sessions/${sid}/contacts/check/${digits}`,
      );
      const payload = data.data ?? data;
      if (payload.chatId?.trim()) return payload.chatId.trim();
      if (payload.exists) return `${digits}@c.us`;
      return null;
    } catch (err: any) {
      this.logger.debug(`contacts/check failed for ${digits}: ${err?.message}`);
      return `${digits}@c.us`;
    }
  }

  async sendText(payload: SendTextPayload): Promise<void> {
    const sessionId = payload.sessionId ?? (await this.resolveSessionId());
    await this.request(`/api/sessions/${sessionId}/messages/send-text`, 'POST', {
      chatId: payload.chatId,
      text: payload.text,
    });
    this.logger.debug(`Sent text to ${payload.chatId} via session ${sessionId}`);
    try {
      await this.waMessages.logOutbound({
        chatId: payload.chatId,
        body: payload.text,
        source: payload.source ?? 'bot',
        waSessionId: sessionId,
      });
    } catch (err) {
      this.logger.warn(`Failed to log outbound WA message: ${err}`);
    }
  }

  async sendImage(payload: SendImagePayload): Promise<void> {
    const sessionId = payload.sessionId ?? (await this.resolveSessionId());
    const body = this.buildMediaBody(payload.chatId, payload.image, payload.caption);
    await this.request(`/api/sessions/${sessionId}/messages/send-image`, 'POST', body);
    this.logger.debug(`Sent image to ${payload.chatId} via session ${sessionId}`);
    try {
      await this.waMessages.logOutbound({
        chatId: payload.chatId,
        body: payload.caption?.trim() || '[imagen]',
        source: payload.source ?? 'bot',
        waSessionId: sessionId,
        messageType: 'image',
        mediaUrl: payload.image.url,
        mimeType: payload.image.mimetype,
        caption: payload.caption,
      });
    } catch (err) {
      this.logger.warn(`Failed to log outbound WA image: ${err}`);
    }
  }

  async sendDocument(payload: SendDocumentPayload): Promise<void> {
    const sessionId = payload.sessionId ?? (await this.resolveSessionId());
    const body = this.buildMediaBody(payload.chatId, payload.document, payload.caption);
    await this.request(`/api/sessions/${sessionId}/messages/send-document`, 'POST', body);
    this.logger.debug(`Sent document to ${payload.chatId} via session ${sessionId}`);
    try {
      await this.waMessages.logOutbound({
        chatId: payload.chatId,
        body: payload.caption?.trim() || '[documento]',
        source: payload.source ?? 'bot',
        waSessionId: sessionId,
        messageType: 'document',
        mediaUrl: payload.document.url,
        mimeType: payload.document.mimetype,
        caption: payload.caption,
      });
    } catch (err) {
      this.logger.warn(`Failed to log outbound WA document: ${err}`);
    }
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
    const result = await this.request<unknown>(`/api/sessions/${sessionId}/webhooks`);
    const data = this.unwrapData<{ id: string; url: string }[]>(result);
    if (Array.isArray(data)) return data;
    if (Array.isArray(result)) return result as { id: string; url: string }[];
    return [];
  }

  /**
   * URL registrada en OpenWA. Usa PUBLIC_API_URL cuando la URL interna (backend-api)
   * falla validacion SSRF/@IsUrl en el panel OpenWA.
   */
  private resolveWebhookUrl(): string {
    const explicit = this.config.get('OPENWA_WEBHOOK_PUBLIC_URL', '').trim();
    if (explicit) return explicit;

    const internal = this.config.get(
      'OPENWA_WEBHOOK_URL',
      'http://backend-api:3000/api/webhooks/openwa',
    );
    const publicBase = this.config.get('PUBLIC_API_URL', '').replace(/\/$/, '');
    if (publicBase && internal.includes('backend-api')) {
      let url = `${publicBase}/webhooks/openwa`;
      // Desde el contenedor openwa, localhost apunta al propio contenedor
      url = url
        .replace('://localhost:', '://host.docker.internal:')
        .replace('://127.0.0.1:', '://host.docker.internal:');
      return url;
    }
    return internal;
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
    const url = this.resolveWebhookUrl();
    const secret = this.config.get('OPENWA_WEBHOOK_SECRET', '');

    const existing = await this.listWebhooks(sessionId);
    const match = existing.find((w) => w.url === url);

    const createPayload = {
      url,
      events: ['message.received'],
      ...(secret ? { secret } : {}),
    };

    if (match) {
      await this.request(`/api/sessions/${sessionId}/webhooks/${match.id}`, 'PUT', {
        ...createPayload,
        active: true,
      });
      this.logger.log(`Webhook updated for session "${sessionId}": ${url}`);
      return;
    }

    await this.request(`/api/sessions/${sessionId}/webhooks`, 'POST', createPayload);
    this.logger.log(`Webhook registered for session "${sessionId}": ${url}`);
  }

  /** Estado de infraestructura OpenWA (Redis, cola BullMQ). */
  async getInfraStatus(): Promise<{
    redisConnected: boolean;
    queueEnabled: boolean;
  }> {
    try {
      const data = await this.request<{
        redis?: { connected?: boolean; enabled?: boolean };
        queue?: { enabled?: boolean };
      }>('/api/infra/status');
      return {
        redisConnected: data.redis?.connected === true,
        queueEnabled: data.queue?.enabled === true,
      };
    } catch {
      return { redisConnected: false, queueEnabled: false };
    }
  }

  /** Espera a que OpenWA responda healthy tras un reinicio. */
  async waitForHealthy(attempts = 24, delayMs = 5000): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      try {
        const url = `${this.baseUrl}/api/health/ready`;
        const res = await fetch(url);
        if (res.ok) return true;
      } catch {
        /* retry */
      }
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
  }

  /**
   * Habilita Redis externo y BullMQ en OpenWA (idempotente).
   * Sincroniza data/.env.generated para que el panel muestre la config correcta.
   */
  async ensureInfrastructure(): Promise<{ changed: boolean; restarted: boolean }> {
    const redisHost = this.config.get('REDIS_HOST', 'redis');
    const redisPort = this.config.get('REDIS_PORT', '6379');

    const before = await this.getInfraStatus();
    if (before.redisConnected && before.queueEnabled) {
      this.logger.log('OpenWA infrastructure already configured (Redis + BullMQ)');
      return { changed: false, restarted: false };
    }

    const payload = {
      redis: {
        enabled: true,
        builtIn: false,
        host: redisHost,
        port: String(redisPort),
      },
      queue: { enabled: true },
    };

    const result = await this.request<{
      saved?: boolean;
      message?: string;
    }>('/api/infra/config', 'PUT', payload);

    if (result.saved === false) {
      throw new Error(result.message || 'OpenWA failed to save infrastructure config');
    }

    this.logger.log('OpenWA infrastructure config saved; requesting restart...');

    try {
      await this.request('/api/infra/restart', 'POST', {});
    } catch (err: any) {
      this.logger.warn(`OpenWA restart request: ${err?.message || err}`);
    }

    const healthy = await this.waitForHealthy();
    if (!healthy) {
      throw new Error('OpenWA did not become healthy after infrastructure restart');
    }

    const after = await this.getInfraStatus();
    if (!after.redisConnected) {
      this.logger.warn('OpenWA Redis still not connected after restart');
    }
    if (!after.queueEnabled) {
      this.logger.warn('OpenWA BullMQ queue still not enabled after restart');
    }

    this.logger.log(
      `OpenWA infrastructure ready (redis=${after.redisConnected}, queue=${after.queueEnabled})`,
    );
    return { changed: true, restarted: true };
  }

  getRedisClient(): Redis {
    return this.redis;
  }
}
