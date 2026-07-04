import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NovitaBalanceService } from '../bot-ai/novita-balance.service';
import { OpenwaPluginService } from '../openwa/openwa-plugin.service';
import { OpenwaService } from '../openwa/openwa.service';
import { WORKFLOW_FETCH } from '../workflows/workflow-events.service';

export type WhatsappBotEngine = 'legacy' | 'novita' | 'n8n';
export type N8nChatScope = 'sandbox' | 'core';
export type N8nSalesMode = 'disabled' | 'sandbox' | 'core';

export type BotEngineBlocker =
  | 'zent_flow_not_installed'
  | 'zent_flow_intercepting'
  | 'n8n_secret_missing'
  | 'n8n_webhook_unreachable'
  | 'sandbox_phone_empty'
  | 'novita_api_key_missing'
  | 'novita_balance_low'
  | 'novita_store_disabled'
  | 'openwa_disconnected';

export const BLOCKER_MESSAGES: Record<BotEngineBlocker, string> = {
  zent_flow_not_installed:
    'Plugin zent-flow no instalado en OpenWA. Pulsa "Aplicar y sincronizar" o repara el webhook.',
  zent_flow_intercepting:
    'zent-flow sigue mostrando menu numerico. Pulsa "Aplicar y sincronizar".',
  n8n_secret_missing: 'Falta N8N_WEBHOOK_SECRET en Dokploy (secreto HMAC).',
  n8n_webhook_unreachable:
    'No se alcanza el webhook de chat n8n. Verifica que el workflow zent-chat este publicado.',
  sandbox_phone_empty: 'Anade al menos un telefono sandbox para probar n8n.',
  novita_api_key_missing: 'Configura la API key de Novita.',
  novita_balance_low: 'Saldo Novita insuficiente para operar.',
  novita_store_disabled: 'Activa el asistente en la tienda para usar Novita.',
  openwa_disconnected: 'WhatsApp desconectado. Reconecta en Configuracion → WhatsApp.',
};

export interface BotEngineConfig {
  engine: WhatsappBotEngine;
  source: 'database' | 'env';
  n8nWorkflowsEnabled: boolean;
  n8nWebhookBaseUrl: string;
  n8nSalesMode: N8nSalesMode;
  n8nChatScope: N8nChatScope;
  n8nChatWebhookUrl: string;
  n8nChatSandboxPhones: string;
  webhookSecret: string;
  botAiEnabled: boolean;
}

export interface BotEngineStatus extends BotEngineConfig {
  blockers: BotEngineBlocker[];
  blockerMessages: string[];
  zentFlowPassThrough: boolean;
  zentFlowInstalled: boolean;
  zentFlowPassThroughActual: boolean | null;
  openwaConnected: boolean;
  openwaSessions: Array<{ id: string; status: string }>;
  n8nChatWebhookOk: boolean | null;
  novitaKeyConfigured: boolean;
  novitaBalanceUsd: number | null;
}

@Injectable()
export class BotEngineService {
  private cache: { at: number; value: BotEngineConfig } | null = null;
  private readonly ttlMs = 5000;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private novitaBalance: NovitaBalanceService,
    private openwaPlugin: OpenwaPluginService,
    private openwa: OpenwaService,
    @Optional()
    @Inject(WORKFLOW_FETCH)
    private fetchImpl: typeof fetch = fetch,
  ) {}

  invalidate(): void {
    this.cache = null;
  }

  async getConfig(): Promise<BotEngineConfig> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) {
      return this.cache.value;
    }

    const store = await this.prisma.storeSettings.findFirst();
    const envEngine = this.normalizeEngine(this.envStr('WHATSAPP_BOT_ENGINE'));
    const envChatMode = this.envStr('N8N_CHAT_MODE', 'disabled');

    let engine: WhatsappBotEngine;
    let source: 'database' | 'env' = 'database';

    if (store?.whatsappBotEngine) {
      engine = this.normalizeEngine(store.whatsappBotEngine);
    } else if (envEngine) {
      engine = envEngine;
      source = 'env';
    } else if (envChatMode === 'sandbox' || envChatMode === 'core') {
      engine = 'n8n';
      source = 'env';
    } else if (store?.botAiEnabled) {
      engine = 'novita';
    } else {
      engine = 'legacy';
    }

    const n8nChatScope = this.normalizeChatScope(
      store?.n8nChatScope ?? (envChatMode === 'core' ? 'core' : envChatMode === 'sandbox' ? 'sandbox' : 'sandbox'),
    );

    const value: BotEngineConfig = {
      engine,
      source,
      n8nWorkflowsEnabled:
        store?.n8nWorkflowsEnabled ??
        this.envStr('N8N_WORKFLOWS_ENABLED', 'false') === 'true',
      n8nWebhookBaseUrl:
        store?.n8nWebhookBaseUrl?.trim() ||
        this.envStr('N8N_WEBHOOK_BASE_URL', 'http://n8n:5678/webhook/zent'),
      n8nSalesMode: this.normalizeSalesMode(
        store?.n8nSalesMode ?? this.envStr('N8N_SALES_MODE', 'sandbox'),
      ),
      n8nChatScope,
      n8nChatWebhookUrl:
        store?.n8nChatWebhookUrl?.trim() ||
        this.envStr('N8N_CHAT_WEBHOOK_URL', 'http://n8n:5678/webhook/zent-chat'),
      n8nChatSandboxPhones:
        store?.n8nChatSandboxPhones?.trim() || this.envStr('N8N_CHAT_SANDBOX_PHONES'),
      webhookSecret: this.envStr('N8N_WEBHOOK_SECRET'),
      botAiEnabled: store?.botAiEnabled ?? false,
    };

    this.cache = { at: Date.now(), value };
    return value;
  }

  shouldRouteToN8n(phone: string | undefined | null, cfg: BotEngineConfig): boolean {
    if (cfg.engine !== 'n8n') return false;
    if (!cfg.webhookSecret) return false;
    if (cfg.n8nChatScope === 'core') return true;
    return this.matchesSandboxPhone(phone, cfg.n8nChatSandboxPhones);
  }

  shouldRoutePhone(phone: string | undefined | null, cfg: BotEngineConfig): boolean {
    if (cfg.engine === 'n8n') return this.shouldRouteToN8n(phone, cfg);
    return true;
  }

  matchesSandboxPhone(phone: string | undefined | null, sandboxPhones: string): boolean {
    const normalized = phone?.replace(/\D/g, '') ?? '';
    if (!normalized) return false;
    const candidates = sandboxPhones
      .split(',')
      .map((p) => p.replace(/\D/g, ''))
      .filter(Boolean);
    return candidates.some(
      (candidate) => normalized.endsWith(candidate) || candidate.endsWith(normalized),
    );
  }

  async getStatus(): Promise<BotEngineStatus> {
    const cfg = await this.getConfig();
    const blockers: BotEngineBlocker[] = [];

    const zentFlowInstalled = await this.openwaPlugin.isZentFlowInstalled();
    let zentFlowPassThroughActual: boolean | null = null;
    if (zentFlowInstalled) {
      const zfConfig = await this.openwaPlugin.getZentFlowConfig();
      zentFlowPassThroughActual = zfConfig.passThrough === true;
      if (cfg.engine !== 'legacy' && zentFlowPassThroughActual === false) {
        blockers.push('zent_flow_intercepting');
      }
    } else if (cfg.engine === 'legacy') {
      blockers.push('zent_flow_not_installed');
    }

    let openwaConnected = false;
    let openwaSessions: Array<{ id: string; status: string }> = [];
    try {
      openwaSessions = (await this.openwa.getSessions()).map((s) => ({
        id: s.id,
        status: s.status,
      }));
      openwaConnected = openwaSessions.some((s) =>
        /connected|ready|authenticated/i.test(s.status),
      );
      if (!openwaConnected && openwaSessions.length > 0) {
        blockers.push('openwa_disconnected');
      }
    } catch {
      blockers.push('openwa_disconnected');
    }

    const novitaKeyConfigured = !!this.envStr('NOVITA_API_KEY');
    let novitaBalanceUsd: number | null = null;

    if (cfg.engine === 'novita') {
      if (!cfg.botAiEnabled) blockers.push('novita_store_disabled');
      if (!novitaKeyConfigured) blockers.push('novita_api_key_missing');
      if (novitaKeyConfigured) {
        novitaBalanceUsd = await this.novitaBalance.getAvailableBalanceUsd();
        const min = Number.parseFloat(this.envStr('NOVITA_MIN_BALANCE_USD', '0.01'));
        if (novitaBalanceUsd !== null && novitaBalanceUsd < min) {
          blockers.push('novita_balance_low');
        }
      }
    }

    const n8nChatWebhookOk: boolean | null = null;
    if (cfg.engine === 'n8n') {
      if (!cfg.webhookSecret) blockers.push('n8n_secret_missing');
      if (cfg.n8nChatScope === 'sandbox' && !cfg.n8nChatSandboxPhones.trim()) {
        blockers.push('sandbox_phone_empty');
      }
    }

    return {
      ...cfg,
      blockers,
      blockerMessages: blockers.map((b) => BLOCKER_MESSAGES[b]),
      zentFlowPassThrough: cfg.engine !== 'legacy',
      zentFlowInstalled,
      zentFlowPassThroughActual,
      openwaConnected,
      openwaSessions,
      n8nChatWebhookOk,
      novitaKeyConfigured,
      novitaBalanceUsd,
    };
  }

  async testN8nChatWebhook(): Promise<{ ok: boolean; status: number | null; error?: string }> {
    const cfg = await this.getConfig();
    if (!cfg.webhookSecret) {
      return { ok: false, status: null, error: 'N8N_WEBHOOK_SECRET missing' };
    }
    const body = JSON.stringify({
      chatId: 'sandbox@test',
      message: 'test ping from dashboard',
      contactPhone: '51999999999',
      messageType: 'text',
      context: { source: 'integration_test' },
    });
    const crypto = await import('crypto');
    const digest = crypto.createHmac('sha256', cfg.webhookSecret).update(body).digest('hex');
    try {
      const res = await this.fetchImpl(cfg.n8nChatWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Zent-Signature': `sha256=${digest}`,
        },
        body,
        signal: AbortSignal.timeout(5000),
      });
      return { ok: res.ok, status: res.status };
    } catch (err: any) {
      return { ok: false, status: null, error: err?.message || String(err) };
    }
  }

  private envStr(key: string, defaultValue = ''): string {
    return (process.env[key] ?? this.config.get<string>(key, defaultValue) ?? '').trim();
  }

  private normalizeEngine(value: string | null | undefined): WhatsappBotEngine {
    const v = (value ?? '').trim().toLowerCase();
    if (v === 'novita' || v === 'n8n') return v;
    return 'legacy';
  }

  private normalizeChatScope(value: string | null | undefined): N8nChatScope {
    return (value ?? '').trim().toLowerCase() === 'core' ? 'core' : 'sandbox';
  }

  private normalizeSalesMode(value: string | null | undefined): N8nSalesMode {
    const v = (value ?? '').trim().toLowerCase();
    if (v === 'disabled' || v === 'core') return v;
    return 'sandbox';
  }
}
