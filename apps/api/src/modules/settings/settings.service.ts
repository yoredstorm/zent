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
import { BotEngineService } from '../whatsapp-bot/bot-engine.service';
import { OpenwaPluginService } from '../openwa/openwa-plugin.service';
import { WorkflowEventsService } from '../workflows/workflow-events.service';

@Injectable()
export class SettingsService {
  private lastZentFlowSync: {
    ok: boolean;
    passThrough: boolean;
    pluginInstalled: boolean;
    at: number;
    error?: string;
    message?: string;
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
    private botEngine: BotEngineService,
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

    const engineStatus = await this.botEngine.getStatus();
    const cfg = await this.botEngine.getConfig();
    const routingStatus = await this.botRouting.getStatus();
    const keyConfigured = engineStatus.novitaKeyConfigured;

    let zentFlowSyncWarning: string | null = null;
    if (this.lastZentFlowSync?.error) {
      zentFlowSyncWarning = this.lastZentFlowSync.error;
    } else if (engineStatus.blockerMessages.length > 0) {
      zentFlowSyncWarning = engineStatus.blockerMessages[0];
    }

    const n8nChatMode =
      cfg.engine === 'n8n' || cfg.engine === 'n8n_ai'
        ? cfg.n8nChatScope
        : ('disabled' as const);

    return {
      whatsappBotEngine: cfg.engine,
      engineStatus: {
        engine: engineStatus.engine,
        source: engineStatus.source,
        blockers: engineStatus.blockers,
        blockerMessages: engineStatus.blockerMessages,
        zentFlowPassThrough: engineStatus.zentFlowPassThrough,
        zentFlowInstalled: engineStatus.zentFlowInstalled,
        zentFlowPassThroughActual: engineStatus.zentFlowPassThroughActual,
        openwaConnected: engineStatus.openwaConnected,
        openwaSessions: engineStatus.openwaSessions,
        novitaKeyConfigured: engineStatus.novitaKeyConfigured,
        novitaBalanceUsd: engineStatus.novitaBalanceUsd,
      },
      botAiEnabled: store.botAiEnabled,
      botAiBusinessDescription: store.botAiBusinessDescription,
      botAiPolicies: store.botAiPolicies,
      botAiPlaybook: store.botAiPlaybook,
      novitaApiKeyConfigured: keyConfigured,
      novitaBotEnabled: cfg.engine === 'novita',
      novitaModel: this.config.get('NOVITA_MODEL', 'deepseek/deepseek-v3.2'),
      novitaBalanceUsd: engineStatus.novitaBalanceUsd ?? routingStatus.balanceUsd,
      hasSufficientBalance:
        (engineStatus.novitaBalanceUsd ?? routingStatus.balanceUsd) !== null &&
        (engineStatus.novitaBalanceUsd ?? routingStatus.balanceUsd)! >= routingStatus.minBalanceUsd,
      activeBotMode: cfg.engine === 'novita' ? 'ai' : 'legacy',
      desiredBotMode: cfg.engine === 'novita' ? 'ai' : 'legacy',
      effectiveBotMode: routingStatus.effectiveMode,
      routingReasons: routingStatus.reasons,
      minBalanceUsd: routingStatus.minBalanceUsd,
      zentFlowInstalled: engineStatus.zentFlowInstalled,
      zentFlowPassThrough: engineStatus.zentFlowPassThroughActual,
      zentFlowSyncOk: this.lastZentFlowSync?.ok ?? null,
      zentFlowSyncAt: this.lastZentFlowSync?.at ?? null,
      zentFlowSyncWarning,
      n8nWorkflowsEnabled: cfg.n8nWorkflowsEnabled,
      n8nWebhookBaseUrl: cfg.n8nWebhookBaseUrl,
      n8nWebhookBaseUrlConfigured: !!cfg.n8nWebhookBaseUrl,
      n8nWebhookSecretConfigured: !!cfg.webhookSecret,
      n8nEmbedded: cfg.n8nWebhookBaseUrl.includes('://n8n:5678/'),
      n8nPublicUrl: this.config.get<string>('N8N_PUBLIC_URL', '').trim() || null,
      n8nInternalWebhookBaseUrl: this.defaultN8nWebhookBaseUrl(),
      n8nSalesMode: cfg.n8nSalesMode,
      n8nChatMode,
      n8nChatScope: cfg.n8nChatScope,
      n8nChatWebhookUrl: cfg.n8nChatWebhookUrl,
      n8nChatSandboxPhones: cfg.n8nChatSandboxPhones,
      n8nChatTemplates: [
        'infra/n8n/orquestador/zent-orquestador.workflow.json',
      ],
      n8nHealth: await this.getN8nHealth(cfg.n8nWebhookBaseUrl),
      n8nSecretConfigured: !!cfg.webhookSecret,
      lastN8nTestResult: this.lastN8nTestResult,
    };
  }

  async getIntegrationStatus() {
    const status = await this.botEngine.getStatus();
    const sandboxPhones = status.n8nChatSandboxPhones
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const testPhone = sandboxPhones[0] || null;
    return {
      ...status,
      wouldRouteTestPhone: testPhone
        ? this.botEngine.shouldRouteToN8n(testPhone, status)
        : (status.engine === 'n8n' || status.engine === 'n8n_ai') && status.n8nChatScope === 'core',
      testPhone,
      wouldRoutePhones: sandboxPhones.map((phone) => ({
        phone,
        wouldRoute: this.botEngine.shouldRouteToN8n(phone, status),
      })),
      zentFlowMayIntercept: status.zentFlowPassThroughActual === false,
    };
  }

  async testN8nChatWebhook() {
    const result = await this.botEngine.testN8nChatWebhook();
    return result;
  }

  async updateBotAiSettings(dto: UpdateBotAiDto) {
    const current = await this.prisma.storeSettings.findFirst();
    if (!current) throw new NotFoundException('Tienda no configurada');

    const {
      novitaApiKey,
      novitaBotEnabled,
      whatsappBotEngine,
      n8nWorkflowsEnabled,
      n8nWebhookBaseUrl,
      n8nWebhookSecret,
      n8nSalesMode,
      n8nChatMode,
      n8nChatScope,
      n8nChatWebhookUrl,
      n8nChatSandboxPhones,
      n8nRestoreDefaults,
      ...storeFields
    } = dto;

    let engine = whatsappBotEngine as 'legacy' | 'novita' | 'n8n' | 'n8n_ai' | undefined;
    if (!engine && n8nChatMode && n8nChatMode !== 'disabled') engine = 'n8n';
    if (!engine && novitaBotEnabled) engine = 'novita';

    let chatScope = n8nChatScope as 'sandbox' | 'core' | undefined;
    if (!chatScope && n8nChatMode) {
      chatScope = n8nChatMode === 'core' ? 'core' : n8nChatMode === 'sandbox' ? 'sandbox' : undefined;
    }

    const dbUpdate: Record<string, unknown> = { ...storeFields };

    if (engine) {
      dbUpdate.whatsappBotEngine = engine;
      if (engine === 'novita') dbUpdate.botAiEnabled = true;
      if (engine === 'legacy') dbUpdate.botAiEnabled = false;
    }

    if (n8nWorkflowsEnabled !== undefined) dbUpdate.n8nWorkflowsEnabled = n8nWorkflowsEnabled;
    if (n8nWebhookBaseUrl !== undefined) dbUpdate.n8nWebhookBaseUrl = n8nWebhookBaseUrl.trim();
    if (n8nSalesMode !== undefined) {
      dbUpdate.n8nSalesMode = ['disabled', 'sandbox', 'core'].includes(n8nSalesMode)
        ? n8nSalesMode
        : 'sandbox';
    }
    if (chatScope) dbUpdate.n8nChatScope = chatScope;
    if (n8nChatWebhookUrl !== undefined) dbUpdate.n8nChatWebhookUrl = n8nChatWebhookUrl.trim();
    if (n8nChatSandboxPhones !== undefined) {
      dbUpdate.n8nChatSandboxPhones = n8nChatSandboxPhones.trim();
    }

    if (n8nRestoreDefaults) {
      dbUpdate.n8nWebhookBaseUrl = this.defaultN8nWebhookBaseUrl();
      dbUpdate.n8nWorkflowsEnabled = true;
      dbUpdate.n8nSalesMode = 'sandbox';
      dbUpdate.n8nChatScope = 'sandbox';
      dbUpdate.n8nChatWebhookUrl = this.defaultN8nChatWebhookUrl();
      if (engine === undefined) dbUpdate.whatsappBotEngine = 'n8n';
      if (!this.config.get<string>('N8N_WEBHOOK_SECRET', '').trim()) {
        this.secrets.upsertEnvSecret('N8N_WEBHOOK_SECRET', this.secrets.generateSecret(24));
      }
    }

    await this.prisma.storeSettings.update({
      where: { id: current.id },
      data: dbUpdate,
    });

    if (novitaApiKey?.trim()) {
      this.secrets.upsertEnvSecret('NOVITA_API_KEY', novitaApiKey.trim());
      this.novitaBalance.invalidateCache();
    }

    const resolvedEngine = engine ?? (await this.botEngine.getConfig()).engine;
    this.secrets.upsertEnvConfig(
      'NOVITA_BOT_ENABLED',
      resolvedEngine === 'novita' ? 'true' : 'false',
    );
    this.secrets.upsertEnvConfig(
      'N8N_CHAT_MODE',
      resolvedEngine === 'n8n' || resolvedEngine === 'n8n_ai' ? (chatScope ?? 'sandbox') : 'disabled',
    );

    if (n8nWorkflowsEnabled !== undefined) {
      this.secrets.upsertEnvConfig('N8N_WORKFLOWS_ENABLED', n8nWorkflowsEnabled ? 'true' : 'false');
    }
    if (n8nRestoreDefaults || n8nWebhookBaseUrl !== undefined) {
      const url = n8nRestoreDefaults
        ? this.defaultN8nWebhookBaseUrl()
        : n8nWebhookBaseUrl!.trim();
      this.secrets.upsertEnvConfig('N8N_WEBHOOK_BASE_URL', url);
    }
    if (n8nWebhookSecret?.trim()) {
      this.secrets.upsertEnvSecret('N8N_WEBHOOK_SECRET', n8nWebhookSecret.trim());
    }
    if (n8nSalesMode !== undefined) {
      const mode = ['disabled', 'sandbox', 'core'].includes(n8nSalesMode) ? n8nSalesMode : 'sandbox';
      this.secrets.upsertEnvConfig('N8N_SALES_MODE', mode);
    }
    if (n8nChatWebhookUrl !== undefined || n8nRestoreDefaults) {
      const url = n8nRestoreDefaults
        ? this.defaultN8nChatWebhookUrl()
        : n8nChatWebhookUrl!.trim();
      this.secrets.upsertEnvConfig('N8N_CHAT_WEBHOOK_URL', url);
    }
    if (n8nChatSandboxPhones !== undefined) {
      this.secrets.upsertEnvConfig('N8N_CHAT_SANDBOX_PHONES', n8nChatSandboxPhones.trim());
    }

    this.botEngine.invalidate();
    await this.syncZentFlowPlugin();

    return this.getBotAiSettings();
  }

  async syncZentFlowPlugin() {
    const cfg = await this.botEngine.getConfig();
    const result = await this.openwaPlugin.syncZentFlowForEngine(cfg.engine);
    this.lastZentFlowSync = {
      ok: result.ok,
      passThrough: result.passThrough,
      pluginInstalled: result.pluginInstalled,
      at: Date.now(),
      error: result.error,
      message: result.message,
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
      enabled: await this.workflowEvents.enabled(),
      baseUrlConfigured: !!(await this.workflowEvents.baseUrl()),
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

  private async getN8nHealth(
    webhookBaseUrl?: string,
  ): Promise<{ ok: boolean; status: number | null; url: string; error?: string }> {
    const base = (webhookBaseUrl ?? this.defaultN8nWebhookBaseUrl()).replace(/\/webhook\/zent\/?$/, '');
    const url = `${base}/healthz`;
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
