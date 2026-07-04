import { OpenwaBootstrapService } from './openwa-bootstrap.service';

describe('OpenwaBootstrapService', () => {
  function createService(overrides: {
    validateApiKey?: jest.Mock;
    ensureInfrastructure?: jest.Mock;
    ensureWebhook?: jest.Mock;
    syncZentFlowForMode?: jest.Mock;
    getMode?: jest.Mock;
  } = {}) {
    const config = { get: jest.fn((key: string, fallback?: string) => fallback) };
    const openwa = {
      validateApiKey: overrides.validateApiKey ?? jest.fn().mockResolvedValue(undefined),
      ensureInfrastructure: overrides.ensureInfrastructure ?? jest.fn().mockResolvedValue(undefined),
      ensureWebhook: overrides.ensureWebhook ?? jest.fn().mockResolvedValue(undefined),
    };
    const prisma = { systemInstall: { findFirst: jest.fn() } };
    const openwaPlugin = {
      syncZentFlowForMode:
        overrides.syncZentFlowForMode ??
        jest.fn().mockResolvedValue({ ok: true, passThrough: true }),
    };
    const botRouting = { getMode: overrides.getMode ?? jest.fn().mockResolvedValue('ai') };

    return {
      service: new OpenwaBootstrapService(
        config as any,
        openwa as any,
        prisma as any,
        openwaPlugin as any,
        botRouting as any,
      ),
      openwa,
      openwaPlugin,
      botRouting,
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
    expect(openwaPlugin.syncZentFlowForMode).toHaveBeenCalledWith('ai');
  });
});
