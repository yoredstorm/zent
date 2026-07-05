import { OpenwaBootstrapService } from './openwa-bootstrap.service';

describe('OpenwaBootstrapService', () => {
  function createService(overrides: {
    validateApiKey?: jest.Mock;
    ensureInfrastructure?: jest.Mock;
    ensureWebhook?: jest.Mock;
    syncZentFlowForEngine?: jest.Mock;
    getConfig?: jest.Mock;
    getStatus?: jest.Mock;
  } = {}) {
    const config = { get: jest.fn((key: string, fallback?: string) => fallback) };
    const openwa = {
      validateApiKey: overrides.validateApiKey ?? jest.fn().mockResolvedValue(undefined),
      ensureInfrastructure: overrides.ensureInfrastructure ?? jest.fn().mockResolvedValue(undefined),
      ensureWebhook: overrides.ensureWebhook ?? jest.fn().mockResolvedValue(undefined),
    };
    const prisma = { systemInstall: { findFirst: jest.fn() } };
    const openwaPlugin = {
      syncZentFlowForEngine:
        overrides.syncZentFlowForEngine ??
        jest.fn().mockResolvedValue({ ok: true, passThrough: true }),
    };
    const botRouting = { getMode: jest.fn().mockResolvedValue('ai') };
    const botEngine = {
      getConfig: overrides.getConfig ?? jest.fn().mockResolvedValue({ engine: 'novita' }),
      getStatus:
        overrides.getStatus ??
        jest.fn().mockResolvedValue({
          engine: 'novita',
          zentFlowPassThroughActual: true,
        }),
    };

    return {
      service: new OpenwaBootstrapService(
        config as any,
        openwa as any,
        prisma as any,
        openwaPlugin as any,
        botRouting as any,
        botEngine as any,
      ),
      openwa,
      openwaPlugin,
      botEngine,
    };
  }

  it('repairs OpenWA webhook infrastructure and zent-flow', async () => {
    const { service, openwa, openwaPlugin } = createService();

    const result = await service.repairWebhook();

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        apiKeyValid: true,
        infrastructureOk: true,
        webhookOk: true,
        zentFlowOk: true,
      }),
    );
    expect(openwa.validateApiKey).toHaveBeenCalled();
    expect(openwa.ensureInfrastructure).toHaveBeenCalled();
    expect(openwa.ensureWebhook).toHaveBeenCalled();
    expect(openwaPlugin.syncZentFlowForEngine).toHaveBeenCalledWith('novita');
  });

  it('forces zent-flow resync when intercepting while engine is n8n', async () => {
    const syncZentFlowForEngine = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, passThrough: false, pluginInstalled: true })
      .mockResolvedValueOnce({ ok: true, passThrough: true, pluginInstalled: true });
    const { service, openwaPlugin } = createService({
      getConfig: jest.fn().mockResolvedValue({ engine: 'n8n' }),
      getStatus: jest.fn().mockResolvedValue({
        engine: 'n8n',
        zentFlowPassThroughActual: false,
      }),
      syncZentFlowForEngine,
    });

    await service.ensureZentFlowPlugin();

    expect(syncZentFlowForEngine).toHaveBeenCalledTimes(2);
    expect(syncZentFlowForEngine).toHaveBeenNthCalledWith(1, 'n8n');
    expect(syncZentFlowForEngine).toHaveBeenNthCalledWith(2, 'n8n');
  });
});
