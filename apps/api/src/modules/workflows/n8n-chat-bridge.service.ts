import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { OpenwaService } from '../openwa/openwa.service';
import { BotTurnLogService } from '../whatsapp-bot/bot-turn-log.service';
import { WORKFLOW_FETCH } from './workflow-events.service';

export interface N8nChatBridgeInput {
  chatId: string;
  waSessionId?: string;
  contactPhone?: string | null;
  message: string;
  messageType?: string;
  context?: Record<string, unknown>;
}

export interface N8nChatBridgeRuntime {
  chatWebhookUrl: string;
  webhookSecret: string;
}

export interface N8nChatBridgeResult {
  ok: boolean;
  replied: boolean;
  handoff?: boolean;
  metadata?: Record<string, unknown>;
  error?: string;
}

@Injectable()
export class N8nChatBridgeService {
  private readonly logger = new Logger(N8nChatBridgeService.name);

  constructor(
    private config: ConfigService,
    private openwa: OpenwaService,
    private turnLog: BotTurnLogService,
    @Optional()
    @Inject(WORKFLOW_FETCH)
    private fetchImpl: typeof fetch = fetch,
  ) {}

  chatMode(): 'disabled' | 'sandbox' | 'core' {
    const mode = this.config.get<string>('N8N_CHAT_MODE', 'disabled').trim();
    return mode === 'sandbox' || mode === 'core' ? mode : 'disabled';
  }

  /** @deprecated Use BotEngineService.shouldRouteToN8n in worker */
  shouldHandle(contactPhone?: string | null): boolean {
    const mode = this.chatMode();
    if (mode === 'disabled') return false;
    if (!this.secret()) {
      this.logger.warn('N8N_CHAT_MODE is enabled but N8N_WEBHOOK_SECRET is missing');
      return false;
    }
    if (mode === 'core') return true;
    const sandboxPhones = this.config
      .get<string>('N8N_CHAT_SANDBOX_PHONES', '')
      .split(',')
      .map((phone) => phone.replace(/\D/g, ''))
      .filter(Boolean);
    const phone = contactPhone?.replace(/\D/g, '') ?? '';
    return Boolean(phone && sandboxPhones.some((candidate) => phone.endsWith(candidate) || candidate.endsWith(phone)));
  }

  async handleMessage(
    input: N8nChatBridgeInput,
    runtime?: N8nChatBridgeRuntime,
  ): Promise<N8nChatBridgeResult> {
    const startedAt = Date.now();
    const logId = await this.turnLog.startTurn({
      stateKey: input.waSessionId ? `${input.waSessionId}:${input.chatId}` : input.chatId,
      chatId: input.chatId,
      waSessionId: input.waSessionId,
      mode: 'n8n_chat',
      userMessage: input.message.slice(0, 2000),
    });

    try {
      const payload = {
        chatId: input.chatId,
        waSessionId: input.waSessionId,
        contactPhone: input.contactPhone,
        message: input.message,
        messageType: input.messageType ?? 'text',
        context: input.context ?? {},
      };
      const body = JSON.stringify(payload);
      const webhookUrl = runtime?.chatWebhookUrl ?? this.chatWebhookUrl();
      const secret = runtime?.webhookSecret ?? this.secret();
      const response = await this.fetchImpl(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Zent-Signature': this.sign(body, secret),
        },
        body,
        signal: AbortSignal.timeout(this.timeoutMs()),
      });

      if (!response.ok) {
        throw new Error(`n8n chat webhook failed with ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as {
        reply?: string;
        handoff?: boolean;
        metadata?: Record<string, unknown>;
      };
      const reply = data.reply?.trim();
      if (!reply) {
        await this.turnLog.completeTurn(logId, '', Date.now() - startedAt);
        return { ok: true, replied: false, handoff: data.handoff, metadata: data.metadata };
      }

      await this.openwa.sendText({
        chatId: input.chatId,
        sessionId: input.waSessionId,
        text: reply,
      });
      await this.turnLog.completeTurn(logId, reply, Date.now() - startedAt);
      return { ok: true, replied: true, handoff: data.handoff, metadata: data.metadata };
    } catch (err: any) {
      const fallback =
        'Estoy revisando tu mensaje con el equipo de ventas. Te responderemos en breve para continuar con tu pedido.';
      this.logger.warn(`n8n chat bridge fallback: ${err?.message || String(err)}`);
      await this.openwa.sendText({
        chatId: input.chatId,
        sessionId: input.waSessionId,
        text: fallback,
      });
      await this.turnLog.failTurn(logId, err?.message || String(err), fallback);
      return { ok: false, replied: true, error: err?.message || String(err) };
    }
  }

  private chatWebhookUrl(): string {
    return this.config
      .get<string>('N8N_CHAT_WEBHOOK_URL', 'http://n8n:5678/webhook/zent-chat')
      .trim();
  }

  private sign(body: string, secretOverride?: string): string {
    const secret = secretOverride ?? this.secret();
    if (!secret) return '';
    return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  private secret(): string {
    return this.config.get<string>('N8N_WEBHOOK_SECRET', '').trim();
  }

  private timeoutMs(): number {
    const value = Number.parseInt(this.config.get<string>('N8N_CHAT_TIMEOUT_MS', '5000'), 10);
    return Number.isFinite(value) && value >= 500 ? value : 5000;
  }
}
