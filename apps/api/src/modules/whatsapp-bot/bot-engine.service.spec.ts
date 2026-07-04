import { BotEngineService } from './bot-engine.service';

describe('BotEngineService', () => {
  const prisma = { storeSettings: { findFirst: jest.fn() } };
  const config = { get: jest.fn((_k: string, d?: string) => d ?? '') };
  const novitaBalance = { getAvailableBalanceUsd: jest.fn().mockResolvedValue(10) };
  const openwaPlugin = {
    isZentFlowInstalled: jest.fn().mockResolvedValue(true),
    getZentFlowConfig: jest.fn().mockResolvedValue({ passThrough: true }),
  };
  const openwa = {
    getSessions: jest.fn().mockResolvedValue([{ id: 's1', status: 'connected' }]),
  };

  const build = () =>
    new BotEngineService(
      prisma as any,
      config as any,
      novitaBalance as any,
      openwaPlugin as any,
      openwa as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    openwaPlugin.isZentFlowInstalled.mockResolvedValue(true);
    openwaPlugin.getZentFlowConfig.mockResolvedValue({ passThrough: true });
    openwa.getSessions.mockResolvedValue([{ id: 's1', status: 'connected' }]);
    delete process.env.N8N_CHAT_MODE;
    delete process.env.WHATSAPP_BOT_ENGINE;
    delete process.env.N8N_WEBHOOK_SECRET;
  });

  it('returns n8n when whatsappBotEngine is n8n', async () => {
    prisma.storeSettings.findFirst.mockResolvedValue({
      whatsappBotEngine: 'n8n',
      n8nChatScope: 'sandbox',
      n8nChatSandboxPhones: '51987752653',
      n8nWorkflowsEnabled: true,
      n8nSalesMode: 'sandbox',
    });
    process.env.N8N_WEBHOOK_SECRET = 'secret';
    const service = build();
    const cfg = await service.getConfig();
    expect(cfg.engine).toBe('n8n');
    expect(service.shouldRouteToN8n('51987752653', cfg)).toBe(true);
    expect(service.shouldRouteToN8n('51911111111', cfg)).toBe(false);
  });

  it('returns legacy blockers when zent-flow missing', async () => {
    prisma.storeSettings.findFirst.mockResolvedValue({ whatsappBotEngine: 'legacy' });
    openwaPlugin.isZentFlowInstalled.mockResolvedValue(false);
    const service = build();
    const status = await service.getStatus();
    expect(status.blockers).toContain('zent_flow_not_installed');
  });

  it('returns novita blockers when api key missing', async () => {
    prisma.storeSettings.findFirst.mockResolvedValue({
      whatsappBotEngine: 'novita',
      botAiEnabled: true,
    });
    const service = build();
    const status = await service.getStatus();
    expect(status.blockers).toContain('novita_api_key_missing');
  });

  it('flags zent_flow_intercepting when n8n active but passThrough false', async () => {
    prisma.storeSettings.findFirst.mockResolvedValue({
      whatsappBotEngine: 'n8n',
      n8nChatScope: 'core',
    });
    openwaPlugin.getZentFlowConfig.mockResolvedValue({ passThrough: false });
    process.env.N8N_WEBHOOK_SECRET = 'secret';
    const service = build();
    const status = await service.getStatus();
    expect(status.blockers).toContain('zent_flow_intercepting');
  });
});
