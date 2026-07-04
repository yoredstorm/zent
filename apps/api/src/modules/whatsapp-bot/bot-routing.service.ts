import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NovitaBalanceService } from '../bot-ai/novita-balance.service';

export type BotRoutingMode = 'ai' | 'legacy';
export type BotRoutingReason =
  | 'env_disabled'
  | 'api_key_missing'
  | 'store_disabled'
  | 'store_missing'
  | 'balance_unavailable'
  | 'balance_below_min';

export interface BotRoutingStatus {
  desiredMode: BotRoutingMode;
  effectiveMode: BotRoutingMode;
  reasons: BotRoutingReason[];
  envEnabled: boolean;
  keyConfigured: boolean;
  storeEnabled: boolean;
  balanceUsd: number | null;
  minBalanceUsd: number;
}

@Injectable()
export class BotRoutingService {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private novitaBalance: NovitaBalanceService,
  ) {}

  private envString(key: string, defaultValue = ''): string {
    return (process.env[key] ?? this.config.get<string>(key, defaultValue) ?? '').trim();
  }

  private minBalanceUsd(): number {
    const raw = this.envString('NOVITA_MIN_BALANCE_USD', '0.01');
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : 0.01;
  }

  async getStatus(): Promise<BotRoutingStatus> {
    const enabled = this.envString('NOVITA_BOT_ENABLED', 'false') === 'true';
    const key = this.envString('NOVITA_API_KEY');
    const store = await this.prisma.storeSettings.findFirst();
    const storeEnabled = store?.botAiEnabled === true;
    const balanceUsd = key ? await this.novitaBalance.getAvailableBalanceUsd() : null;
    const minBalanceUsd = this.minBalanceUsd();
    const reasons: BotRoutingReason[] = [];

    if (!enabled) reasons.push('env_disabled');
    if (!key) reasons.push('api_key_missing');
    if (!store) reasons.push('store_missing');
    if (store && !storeEnabled) reasons.push('store_disabled');
    if (enabled && key && storeEnabled) {
      if (balanceUsd === null) {
        reasons.push('balance_unavailable');
      } else if (balanceUsd < minBalanceUsd) {
        reasons.push('balance_below_min');
      }
    }

    const desiredMode = enabled && !!key && storeEnabled ? 'ai' : 'legacy';
    return {
      desiredMode,
      effectiveMode: desiredMode,
      reasons,
      envEnabled: enabled,
      keyConfigured: !!key,
      storeEnabled,
      balanceUsd,
      minBalanceUsd,
    };
  }

  async getMode(): Promise<BotRoutingMode> {
    return (await this.getStatus()).effectiveMode;
  }

  async shouldUseAiBot(): Promise<boolean> {
    return (await this.getMode()) === 'ai';
  }
}
