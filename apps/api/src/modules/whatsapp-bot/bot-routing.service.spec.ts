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
    balanceOk?: boolean;
  }) {
    const config = {
      get: jest.fn((key: string, defaultValue?: string) => defaultValue ?? ''),
    } as unknown as ConfigService;

    const prisma = {
      storeSettings: {
        findFirst: jest.fn().mockResolvedValue(overrides?.store ?? { botAiEnabled: true }),
      },
    } as unknown as PrismaService;

    const novitaBalance = {
      hasSufficientBalance: jest
        .fn()
        .mockResolvedValue(overrides?.balanceOk ?? true),
    } as unknown as NovitaBalanceService;

    return new BotRoutingService(config, prisma, novitaBalance);
  }

  it('returns ai when env, store flag, key and balance are ok', async () => {
    process.env.NOVITA_BOT_ENABLED = 'true';
    process.env.NOVITA_API_KEY = 'test-key';
    const service = createService();
    await expect(service.getMode()).resolves.toBe('ai');
    await expect(service.shouldUseAiBot()).resolves.toBe(true);
  });

  it('returns legacy when botAiEnabled is false', async () => {
    process.env.NOVITA_BOT_ENABLED = 'true';
    process.env.NOVITA_API_KEY = 'test-key';
    const service = createService({ store: { botAiEnabled: false } });
    await expect(service.getMode()).resolves.toBe('legacy');
  });

  it('returns legacy when balance insufficient', async () => {
    process.env.NOVITA_BOT_ENABLED = 'true';
    process.env.NOVITA_API_KEY = 'test-key';
    const service = createService({ balanceOk: false });
    await expect(service.getMode()).resolves.toBe('legacy');
  });

  it('returns legacy when API key missing', async () => {
    process.env.NOVITA_BOT_ENABLED = 'true';
    delete process.env.NOVITA_API_KEY;
    const service = createService();
    await expect(service.getMode()).resolves.toBe('legacy');
  });
});
