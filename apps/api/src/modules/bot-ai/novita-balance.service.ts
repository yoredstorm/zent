import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchNovitaBalance, parseNovitaBalanceUsd } from './novita.client';
import { VendorNotifyService } from '../orders/vendor-notify.service';
import { WorkflowEventsService } from '../workflows/workflow-events.service';

interface BalanceCache {
  usd: number;
  fetchedAt: number;
}

export interface NovitaBalanceStatus {
  balanceUsd: number | null;
  fetchedAt: string | null;
  minBalanceUsd: number;
  lowBalanceThresholdUsd: number;
  lowBalance: boolean;
  alertSentAt: string | null;
}

@Injectable()
export class NovitaBalanceService {
  private readonly logger = new Logger(NovitaBalanceService.name);
  private cache: BalanceCache | null = null;
  private readonly cacheTtlMs = 60_000;
  private lowBalanceAlertSentAt: number | null = null;
  private lowBalanceActive = false;

  constructor(
    private config: ConfigService,
    @Optional() private vendorNotify?: VendorNotifyService,
    @Optional() private workflowEvents?: WorkflowEventsService,
  ) {}

  private get apiKey(): string {
    return this.config.get<string>('NOVITA_API_KEY', '').trim();
  }

  private get minBalanceUsd(): number {
    const raw = this.config.get<string>('NOVITA_MIN_BALANCE_USD', '0.01');
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0.01;
  }

  private get lowBalanceThresholdUsd(): number {
    const raw = this.config.get<string>('NOVITA_LOW_BALANCE_ALERT_USD', '3');
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 3;
  }

  private get lowBalanceCooldownMs(): number {
    const raw = this.config.get<string>('NOVITA_LOW_BALANCE_ALERT_COOLDOWN_MINUTES', '360');
    const minutes = Number.parseFloat(raw);
    return (Number.isFinite(minutes) ? minutes : 360) * 60_000;
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

  async getBalanceStatus(force = false): Promise<NovitaBalanceStatus> {
    const balanceUsd = await this.getAvailableBalanceUsd(force);
    const threshold = this.lowBalanceThresholdUsd;
    const lowBalance = balanceUsd !== null && balanceUsd < threshold;

    if (lowBalance) {
      await this.maybeSendLowBalanceAlert(balanceUsd, threshold);
    } else if (balanceUsd !== null && balanceUsd >= threshold) {
      this.lowBalanceActive = false;
      this.lowBalanceAlertSentAt = null;
    }

    return {
      balanceUsd,
      fetchedAt: this.cache?.fetchedAt ? new Date(this.cache.fetchedAt).toISOString() : null,
      minBalanceUsd: this.minBalanceUsd,
      lowBalanceThresholdUsd: threshold,
      lowBalance,
      alertSentAt: this.lowBalanceAlertSentAt
        ? new Date(this.lowBalanceAlertSentAt).toISOString()
        : null,
    };
  }

  private async maybeSendLowBalanceAlert(balanceUsd: number, thresholdUsd: number): Promise<void> {
    const now = Date.now();
    if (
      this.lowBalanceActive &&
      this.lowBalanceAlertSentAt &&
      now - this.lowBalanceAlertSentAt < this.lowBalanceCooldownMs
    ) {
      return;
    }

    this.lowBalanceActive = true;
    this.lowBalanceAlertSentAt = now;

    await this.vendorNotify?.notifyNovitaLowBalance({ balanceUsd, thresholdUsd });
    await this.workflowEvents?.emit('novita.low_balance', {
      balanceUsd,
      thresholdUsd,
      checkedAt: new Date(now).toISOString(),
    });
    await this.postLowBalanceWebhook(balanceUsd, thresholdUsd, new Date(now).toISOString());
  }

  private async postLowBalanceWebhook(
    balanceUsd: number,
    thresholdUsd: number,
    checkedAt: string,
  ): Promise<void> {
    const url = this.config.get<string>('NOVITA_LOW_BALANCE_WEBHOOK_URL', '').trim();
    if (!url) return;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'novita_low_balance',
          balanceUsd,
          thresholdUsd,
          checkedAt,
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Low balance webhook failed: ${res.status}`);
      }
    } catch (err: any) {
      this.logger.warn(`Low balance webhook error: ${err?.message || err}`);
    }
  }
}
