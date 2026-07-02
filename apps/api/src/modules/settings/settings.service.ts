import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateStoreDto } from './dto/update-store.dto';
import { UpdateBotAiDto } from './dto/update-bot-ai.dto';
import { BotAiPromptService } from '../bot-ai/bot-ai-prompt.service';
import { NovitaBalanceService } from '../bot-ai/novita-balance.service';
import { SecretsService } from '../setup/secrets.service';
import { fetchNovitaBalance, parseNovitaBalanceUsd } from '../bot-ai/novita.client';

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private prompt: BotAiPromptService,
    private novitaBalance: NovitaBalanceService,
    private secrets: SecretsService,
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

    const keyConfigured = !!this.config.get<string>('NOVITA_API_KEY', '').trim();
    const envEnabled = this.config.get<string>('NOVITA_BOT_ENABLED', 'false').trim() === 'true';
    const balanceUsd = await this.novitaBalance.getAvailableBalanceUsd();

    return {
      botAiEnabled: store.botAiEnabled,
      botAiBusinessDescription: store.botAiBusinessDescription,
      botAiPolicies: store.botAiPolicies,
      botAiPlaybook: store.botAiPlaybook,
      novitaApiKeyConfigured: keyConfigured,
      novitaBotEnabled: envEnabled,
      novitaModel: this.config.get('NOVITA_MODEL', 'deepseek/deepseek-v3.2'),
      novitaBalanceUsd: balanceUsd,
      hasSufficientBalance: balanceUsd !== null && balanceUsd >= this.minBalanceUsd(),
    };
  }

  async updateBotAiSettings(dto: UpdateBotAiDto) {
    const current = await this.prisma.storeSettings.findFirst();
    if (!current) throw new NotFoundException('Tienda no configurada');

    const { novitaApiKey, novitaBotEnabled, ...storeFields } = dto;

    const updated = await this.prisma.storeSettings.update({
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

    return this.getBotAiSettings();
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
