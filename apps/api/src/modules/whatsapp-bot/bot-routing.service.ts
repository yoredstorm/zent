import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NovitaBalanceService } from '../bot-ai/novita-balance.service';

export type BotRoutingMode = 'ai' | 'legacy';

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

  async getMode(): Promise<BotRoutingMode> {
    const enabled = this.envString('NOVITA_BOT_ENABLED', 'false') === 'true';
    const key = this.envString('NOVITA_API_KEY');
    if (!enabled || !key) return 'legacy';

    const store = await this.prisma.storeSettings.findFirst();
    if (!store?.botAiEnabled) return 'legacy';

    if (!(await this.novitaBalance.hasSufficientBalance())) return 'legacy';

    return 'ai';
  }

  async shouldUseAiBot(): Promise<boolean> {
    return (await this.getMode()) === 'ai';
  }
}
