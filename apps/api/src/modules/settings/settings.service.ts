import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UpdateBotAiDto } from './dto/update-bot-ai.dto';
import { BotAiPromptService } from '../bot-ai/bot-ai-prompt.service';
import { NovitaBalanceService } from '../bot-ai/novita-balance.service';
import { SecretsService } from '../setup/secrets.service';
import { fetchNovitaBalance, parseNovitaBalanceUsd } from '../bot-ai/novita.client';
import { BotRoutingService } from '../whatsapp-bot/bot-routing.service';
import { OpenwaPluginService } from '../openwa/openwa-plugin.service';
import { WorkflowEventsService } from '../workflows/workflow-events.service';

@Injectable()
export class SettingsService {
  private lastZentFlowSync: {
    ok: boolean;
    passThrough: boolean;
    pluginInstalled: boolean;
    at: number;
  } | null = null;
  private lastN8nTestResult: {
    ok: boolean;
    at: number;
    message?: string;
  } | null = null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private prompt: BotAiPromptService,
    private novitaBalance: NovitaBalanceService,
    private secrets: SecretsService,
    private botRouting: BotRoutingService,
    private openwaPlugin: OpenwaPluginService,
    private workflowEvents: WorkflowEventsService,
  ) {}

  async getStore() {
    const store = await this.prisma.storeSettings.findFirst();
    if (!store) return null;
    return this.toStoreResponse(store);
  }

  async updateStore(dto: UpdateStoreDto) {
    const current = await this.prisma.storeSettings.findFirst();
    if (!current) throw new NotFoundException('Tienda no configurada');

    const { phone, ...rest } = dto;
    const data = {
      ...rest,
      ...(phone !== undefined ? { phoneNumber: phone } : {}),
    };

    const updated = await this.prisma.storeSettings.update({
      where: { id: current.id },
      data,
    });
    return this.toStoreResponse(updated);
  }

  async getBotAiSettings() {
    const store = await this.prisma.storeSettings.findFirst();
    if (!store) throw new NotFoundException('Tienda no configurada');

    const keyConfigured = !!(
      process.env.NOVITA_API_KEY?.trim() || this.config.get<string>('NOVITA_API_KEY', '').trim()
    );
    const envEnabled =
      (process.env.NOVITA_BOT_ENABLED ?? this.config.get<string>('NOVITA_BOT_ENABLED', 'false')).trim() ===
      'true';
    const routingStatus = await this.botRouting.getStatus();
    const balanceUsd = routingStatus.balanceUsd;
    const activeBotMode = routingStatus.effectiveMode;
    const desiredBotMode = routingStatus.desiredMode;
    const zentFlowInstalled = await this.openwaPlugin.isZentFlowInstalled();

    let zentFlowPassThrough: boolean | null = null;
    if (!zentFlowInstalled) {
      zentFlowPassThrough = desiredBotMode === 'ai' ? true : null;
    } else {
      const zfConfig = await this.openwaPlugin.getZentFlowConfig();
      zentFlowPassThrough = zfConfig.passThrough === true;
    }

    let zentFlowSyncWarning: string | null = null;
    if (!zentFlowInstalled && desiredBotMode === 'legacy') {
      zentFlowSyncWarning =
        'Plugin zent-flow no instalado en OpenWA. El menu numerico no funcionara hasta instalarlo.';
    } else if (zentFlowInstalled && desiredBotMode === 'ai' && zentFlowPassThrough === false) {
      zentFlowSyncWarning =
        'zent-flow puede estar interceptando mensajes con menu numerico. Usa Sincronizar OpenWA.';
    }

    return {
      botAiEnabled: store.botAiEnabled,
      botAiBusinessDescription: store.botAiBusinessDescription,
      botAiPolicies: store.botAiPolicies,
      botAiPlaybook: store.botAiPlaybook,
      novitaApiKeyConfigured: keyConfigured,
      novitaBotEnabled: envEnabled,
      novitaModel: this.config.get('NOVITA_MODEL', 'deepseek/deepseek-v3.2'),
      novitaBalanceUsd: balanceUsd,
      hasSufficientBalance: balanceUsd !== null && balanceUsd >= routingStatus.minBalanceUsd,
      activeBotMode,
      desiredBotMode,
      effectiveBotMode: routingStatus.effectiveMode,
      routingReasons: routingStatus.reasons,
      minBalanceUsd: routingStatus.minBalanceUsd,
      zentFlowInstalled,
      zentFlowPassThrough,
      zentFlowSyncOk: this.lastZentFlowSync?.ok ?? null,
      zentFlowSyncAt: this.lastZentFlowSync?.at ?? null,
      zentFlowSyncWarning,
      n8nWorkflowsEnabled:
        this.config.get<string>('N8N_WORKFLOWS_ENABLED', 'false').trim() === 'true',
      n8nWebhookBaseUrl: this.config.get<string>('N8N_WEBHOOK_BASE_URL', '').trim(),
      n8nWebhookBaseUrlConfigured: !!this.config.get<string>('N8N_WEBHOOK_BASE_URL', '').trim(),
      n8nWebhookSecretConfigured: !!this.config.get<string>('N8N_WEBHOOK_SECRET', '').trim(),
      n8nEmbedded: this.isEmbeddedN8nConfigured(),
      n8nPublicUrl: this.config.get<string>('N8N_PUBLIC_URL', '').trim() || null,
      n8nInternalWebhookBaseUrl: this.defaultN8nWebhookBaseUrl(),
      n8nSalesMode: this.n8nSalesMode(),
      n8nChatMode: this.n8nChatMode(),
      n8nChatWebhookUrl: this.n8nChatWebhookUrl(),
      n8nChatSandboxPhones: this.config.get<string>('N8N_CHAT_SANDBOX_PHONES', '').trim(),
      n8nChatTemplates: [
        'infra/n8n/templates/zent-whatsapp-sales-chat.workflow.json',
        'infra/n8n/templates/zent-order-status-chat.workflow.json',
      ],
      n8nHealth: await this.getN8nHealth(),
      n8nSecretConfigured: !!this.config.get<string>('N8N_WEBHOOK_SECRET', '').trim(),
      lastN8nTestResult: this.lastN8nTestResult,
    };
  }

  async updateBotAiSettings(dto: UpdateBotAiDto) {
    const current = await this.prisma.storeSettings.findFirst();
    if (!current) throw new NotFoundException('Tienda no configurada');

    const {
      novitaApiKey,
      novitaBotEnabled,
      n8nWorkflowsEnabled,
      n8nWebhookBaseUrl,
      n8nWebhookSecret,
      n8nSalesMode,
      n8nChatMode,
      n8nChatWebhookUrl,
      n8nChatSandboxPhones,
      n8nRestoreDefaults,
      ...storeFields
    } = dto;

    await this.prisma.storeSettings.update({
      where: { id: current.id },
      data: storeFields,
    });

    if (novitaApiKey?.trim()) {
      this.secrets.upsertEnvSecret('NOVITA_API_KEY', novitaApiKey.trim());
      this.novitaBalance.invalidateCache();
    }

    if (novitaBotEnabled !== undefined) {
      this.secrets.upsertEnvConfig('NOVITA_BOT_ENABLED', novitaBotEnabled ? 'true' : 'false');
    }

    if (n8nWorkflowsEnabled !== undefined) {
      this.secrets.upsertEnvConfig('N8N_WORKFLOWS_ENABLED', n8nWorkflowsEnabled ? 'true' : 'false');
    }

    if (n8nRestoreDefaults) {
      this.secrets.upsertEnvConfig('N8N_WEBHOOK_BASE_URL', this.defaultN8nWebhookBaseUrl());
      this.secrets.upsertEnvConfig('N8N_WORKFLOWS_ENABLED', 'true');
      this.secrets.upsertEnvConfig('N8N_SALES_MODE', 'sandbox');
      this.secrets.upsertEnvConfig('N8N_CHAT_MODE', 'sandbox');
      this.secrets.upsertEnvConfig('N8N_CHAT_WEBHOOK_URL', this.defaultN8nChatWebhookUrl());
      if (!this.config.get<string>('N8N_WEBHOOK_SECRET', '').trim()) {
        this.secrets.upsertEnvSecret('N8N_WEBHOOK_SECRET', this.secrets.generateSecret(24));
      }
    } else if (n8nWebhookBaseUrl !== undefined) {
      this.secrets.upsertEnvConfig('N8N_WEBHOOK_BASE_URL', n8nWebhookBaseUrl.trim());
    }

    if (n8nWebhookSecret?.trim()) {
      this.secrets.upsertEnvSecret('N8N_WEBHOOK_SECRET', n8nWebhookSecret.trim());
    }

    if (n8nSalesMode !== undefined) {
      const mode = ['disabled', 'sandbox', 'core'].includes(n8nSalesMode)
        ? n8nSalesMode
        : 'sandbox';
      this.secrets.upsertEnvConfig('N8N_SALES_MODE', mode);
    }

    if (n8nChatMode !== undefined) {
      const mode = ['disabled', 'sandbox', 'core'].includes(n8nChatMode) ? n8nChatMode : 'disabled';
      this.secrets.upsertEnvConfig('N8N_CHAT_MODE', mode);
    }

    if (n8nChatWebhookUrl !== undefined) {
      this.secrets.upsertEnvConfig('N8N_CHAT_WEBHOOK_URL', n8nChatWebhookUrl.trim());
    }

    if (n8nChatSandboxPhones !== undefined) {
      this.secrets.upsertEnvConfig('N8N_CHAT_SANDBOX_PHONES', n8nChatSandboxPhones.trim());
    }

    await this.syncZentFlowPlugin();

    return this.getBotAiSettings();
  }

  async syncZentFlowPlugin() {
    const status = await this.botRouting.getStatus();
    const result = await this.openwaPlugin.syncZentFlowForMode(status.desiredMode);
    this.lastZentFlowSync = {
      ok: result.ok,
      passThrough: result.passThrough,
      pluginInstalled: result.pluginInstalled,
      at: Date.now(),
    };
    return result;
  }

  async getBotAiBalance(force = false) {
    return this.novitaBalance.getBalanceStatus(force);
  }

  async testN8n() {
    await this.workflowEvents.emit('test.ping', { source: 'dashboard', at: new Date().toISOString() });
    const result = {
      ok: true,
      enabled: this.workflowEvents.enabled(),
      baseUrlConfigured: !!this.workflowEvents.baseUrl(),
      secretConfigured: !!this.workflowEvents.secret(),
    };
    this.lastN8nTestResult = {
      ok: result.enabled && result.baseUrlConfigured,
      at: Date.now(),
      message: result.enabled ? 'test.ping emitted' : 'n8n workflows disabled',
    };
    return result;
  }

  async runN8nSalesSandbox() {
    const result = await this.workflowEvents.runSalesSandbox();
    this.lastN8nTestResult = {
      ok: result.ok,
      at: Date.now(),
      message: result.ok ? 'sales sandbox completed' : 'sales sandbox failed',
    };
    return result;
  }

  private defaultN8nWebhookBaseUrl(): string {
    return 'http://n8n:5678/webhook/zent';
  }

  private defaultN8nChatWebhookUrl(): string {
    return 'http://n8n:5678/webhook/zent-chat';
  }

  private n8nSalesMode(): 'disabled' | 'sandbox' | 'core' {
    const mode = this.config.get<string>('N8N_SALES_MODE', 'sandbox').trim();
    return mode === 'disabled' || mode === 'core' ? mode : 'sandbox';
  }

  private n8nChatMode(): 'disabled' | 'sandbox' | 'core' {
    const mode = this.config.get<string>('N8N_CHAT_MODE', 'disabled').trim();
    return mode === 'sandbox' || mode === 'core' ? mode : 'disabled';
  }

  private n8nChatWebhookUrl(): string {
    return this.config.get<string>('N8N_CHAT_WEBHOOK_URL', this.defaultN8nChatWebhookUrl()).trim();
  }

  private isEmbeddedN8nConfigured(): boolean {
    return this.config
      .get<string>('N8N_WEBHOOK_BASE_URL', this.defaultN8nWebhookBaseUrl())
      .includes('://n8n:5678/');
  }

  private async getN8nHealth(): Promise<{ ok: boolean; status: number | null; url: string; error?: string }> {
    const baseUrl = this.config
      .get<string>('N8N_WEBHOOK_BASE_URL', this.defaultN8nWebhookBaseUrl())
      .replace(/\/webhook\/zent\/?$/, '');
    const url = `${baseUrl}/healthz`;
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) });
      return { ok: res.status < 500, status: res.status, url };
    } catch (err: any) {
      return { ok: false, status: null, url, error: err?.message || String(err) };
    }
  }

  async getBotAiPreview() {
    const systemPrompt = await this.prompt.buildSystemPrompt();
    return { systemPrompt };
  }

  getBotAiVariables() {
    return this.prompt.listVariables();
  }

  async testNovitaApiKey(apiKey?: string) {
    const key = apiKey?.trim() || this.config.get<string>('NOVITA_API_KEY', '').trim();
    if (!key) {
      return { ok: false, message: 'No hay API key configurada' };
    }
    try {
      const detail = await fetchNovitaBalance(key);
      const balanceUsd = parseNovitaBalanceUsd(detail);
      return { ok: true, balanceUsd, detail };
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Error al conectar con Novita' };
    }
  }

  private minBalanceUsd(): number {
    const raw = this.config.get<string>('NOVITA_MIN_BALANCE_USD', '0.01');
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0.01;
  }

  private toStoreResponse(store: {
    id: number;
    storeName: string;
    logoUrl: string | null;
    currency: string;
    taxRate: number;
    phoneNumber: string;
    ownerName: string | null;
    whatsappLinked: boolean;
    deliveryFlatFee: { toNumber?: () => number } | number | null;
    updatedAt: Date;
  }) {
    const { phoneNumber, deliveryFlatFee, ...rest } = store;
    return {
      ...rest,
      phone: phoneNumber,
      deliveryFlatFee:
        deliveryFlatFee != null
          ? typeof deliveryFlatFee === 'number'
            ? deliveryFlatFee
            : Number(deliveryFlatFee)
          : null,
    };
  }
}
