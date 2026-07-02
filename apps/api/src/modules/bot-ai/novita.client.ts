import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

export interface NovitaBalanceDetail {
  availableBalance: string;
  cashBalance: string;
  creditLimit: string;
  pendingCharges: string;
  outstandingInvoices: string;
}

export function createNovitaClient(config: ConfigService, apiKey?: string): OpenAI {
  const key = apiKey?.trim() || config.get<string>('NOVITA_API_KEY', '').trim();
  const baseURL = config.get<string>('NOVITA_BASE_URL', 'https://api.novita.ai/openai').trim();
  return new OpenAI({ apiKey: key, baseURL });
}

export async function fetchNovitaBalance(apiKey: string): Promise<NovitaBalanceDetail> {
  const res = await fetch('https://api.novita.ai/openapi/v1/billing/balance/detail', {
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Novita balance error ${res.status}: ${body || res.statusText}`);
  }
  return res.json() as Promise<NovitaBalanceDetail>;
}

export function parseNovitaBalanceUsd(detail: NovitaBalanceDetail): number {
  const raw = detail.availableBalance ?? '0';
  const units = Number.parseInt(raw, 10);
  if (!Number.isFinite(units)) return 0;
  return units / 10000;
}
