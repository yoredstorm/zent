import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchNovitaBalance, parseNovitaBalanceUsd } from './novita.client';

interface BalanceCache {
  usd: number;
  fetchedAt: number;
}

@Injectable()
export class NovitaBalanceService {
  private readonly logger = new Logger(NovitaBalanceService.name);
  private cache: BalanceCache | null = null;
  private readonly cacheTtlMs = 60_000;

  constructor(private config: ConfigService) {}

  private get apiKey(): string {
    return this.config.get<string>('NOVITA_API_KEY', '').trim();
  }

  private get minBalanceUsd(): number {
    const raw = this.config.get<string>('NOVITA_MIN_BALANCE_USD', '0.01');
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0.01;
  }

  async getAvailableBalanceUsd(force = false): Promise<number | null> {
    const key = this.apiKey;
    if (!key) return null;

    const now = Date.now();
    if (!force && this.cache && now - this.cache.fetchedAt < this.cacheTtlMs) {
      return this.cache.usd;
    }

    try {
      const detail = await fetchNovitaBalance(key);
      const usd = parseNovitaBalanceUsd(detail);
      this.cache = { usd, fetchedAt: now };
      return usd;
    } catch (err: any) {
      this.logger.warn(`Novita balance fetch failed: ${err?.message || err}`);
      return this.cache?.usd ?? null;
    }
  }

  invalidateCache() {
    this.cache = null;
  }

  async hasSufficientBalance(): Promise<boolean> {
    const balance = await this.getAvailableBalanceUsd();
    if (balance === null) return false;
    return balance >= this.minBalanceUsd;
  }
}
