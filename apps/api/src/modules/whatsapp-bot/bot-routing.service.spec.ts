import { BotRoutingService } from './bot-routing.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NovitaBalanceService } from '../bot-ai/novita-balance.service';

describe('BotRoutingService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function createService(overrides?: {
    store?: { botAiEnabled: boolean } | null;
    balanceUsd?: number | null;
    minBalanceUsd?: string;
  }) {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'NOVITA_MIN_BALANCE_USD' && overrides?.minBalanceUsd) {
          return overrides.minBalanceUsd;
        }
        return defaultValue ?? '';
      }),
    } as unknown as ConfigService;

    const prisma = {
      storeSettings: {
        findFirst: jest.fn().mockResolvedValue(overrides?.store ?? { botAiEnabled: true }),
      },
    } as unknown as PrismaService;

    const novitaBalance = {
      getAvailableBalanceUsd: jest
        .fn()
        .mockResolvedValue('balanceUsd' in (overrides ?? {}) ? overrides?.balanceUsd : 8.87),
    } as unknown as NovitaBalanceService;

    return new BotRoutingService(config, prisma, novitaBalance);
  }

  it('returns ai when env, store flag, key and balance are ok', async () => {
    process.env.NOVITA_BOT_ENABLED = 'true';
    process.env.NOVITA_API_KEY = 'test-key';
    const service = createService();
    await expect(service.getMode()).resolves.toBe('ai');
    await expect(service.shouldUseAiBot()).resolves.toBe(true);
    await expect(service.getStatus()).resolves.toEqual(
      expect.objectContaining({
        desiredMode: 'ai',
        effectiveMode: 'ai',
        balanceUsd: 8.87,
        reasons: [],
      }),
    );
  });

  it('returns legacy when botAiEnabled is false', async () => {
    process.env.NOVITA_BOT_ENABLED = 'true';
    process.env.NOVITA_API_KEY = 'test-key';
    const service = createService({ store: { botAiEnabled: false } });
    await expect(service.getMode()).resolves.toBe('legacy');
    await expect(service.getStatus()).resolves.toEqual(
      expect.objectContaining({
        desiredMode: 'legacy',
        effectiveMode: 'legacy',
        reasons: expect.arrayContaining(['store_disabled']),
      }),
    );
  });

  it('keeps ai mode when balance is insufficient and reports warning reason', async () => {
    process.env.NOVITA_BOT_ENABLED = 'true';
    process.env.NOVITA_API_KEY = 'test-key';
    const service = createService({ balanceUsd: 0.5, minBalanceUsd: '1' });
    await expect(service.getMode()).resolves.toBe('ai');
    await expect(service.shouldUseAiBot()).resolves.toBe(true);
    await expect(service.getStatus()).resolves.toEqual(
      expect.objectContaining({
        desiredMode: 'ai',
        effectiveMode: 'ai',
        balanceUsd: 0.5,
        minBalanceUsd: 1,
        reasons: expect.arrayContaining(['balance_below_min']),
      }),
    );
  });

  it('keeps ai mode when balance is unavailable and reports warning reason', async () => {
    process.env.NOVITA_BOT_ENABLED = 'true';
    process.env.NOVITA_API_KEY = 'test-key';
    const service = createService({ balanceUsd: null });
    await expect(service.getMode()).resolves.toBe('ai');
    await expect(service.getStatus()).resolves.toEqual(
      expect.objectContaining({
        desiredMode: 'ai',
        effectiveMode: 'ai',
        balanceUsd: null,
        reasons: expect.arrayContaining(['balance_unavailable']),
      }),
    );
  });

  it('returns legacy when API key missing', async () => {
    process.env.NOVITA_BOT_ENABLED = 'true';
    delete process.env.NOVITA_API_KEY;
    const service = createService();
    await expect(service.getMode()).resolves.toBe('legacy');
    await expect(service.getStatus()).resolves.toEqual(
      expect.objectContaining({
        desiredMode: 'legacy',
        effectiveMode: 'legacy',
        reasons: expect.arrayContaining(['api_key_missing']),
      }),
    );
  });
});
