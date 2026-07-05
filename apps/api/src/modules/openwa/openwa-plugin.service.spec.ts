import { OpenwaPluginService } from './openwa-plugin.service';

describe('OpenwaPluginService', () => {
  it('detects zent-flow installed via OpenWA plugin metadata', async () => {
    const openwa = {
      getPlugin: jest.fn().mockResolvedValue({ id: 'zent-flow', enabled: true }),
      listPlugins: jest.fn().mockResolvedValue([]),
      apiRequest: jest.fn(),
    };
    const config = { get: jest.fn((_k: string, d?: string) => d ?? 'secret') };
    const service = new OpenwaPluginService(openwa as any, config as any);

    await expect(service.isZentFlowInstalled()).resolves.toBe(true);
    expect(openwa.apiRequest).not.toHaveBeenCalled();
  });

  it('syncZentFlowForEngine enables pass-through for n8n even when Novita is off', async () => {
    const putBodies: unknown[] = [];
    const openwa = {
      getPlugin: jest.fn().mockResolvedValue({ id: 'zent-flow', enabled: true, config: { passThrough: false } }),
      listPlugins: jest.fn().mockResolvedValue([]),
      apiRequest: jest.fn(async (path: string, method: string, body?: unknown) => {
        if (path.includes('config') && method === 'GET') {
          return { config: { passThrough: false } };
        }
        if (path.includes('config') && method === 'PUT') {
          putBodies.push(body);
          return {};
        }
        return {};
      }),
    };
    const config = { get: jest.fn((_k: string, d?: string) => d ?? 'secret') };
    const service = new OpenwaPluginService(openwa as any, config as any);

    const result = await service.syncZentFlowForEngine('n8n');

    expect(result.passThrough).toBe(true);
    expect(putBodies[0]).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({ passThrough: true, startOnAnyMessage: false }),
      }),
    );
  });

  it('syncZentFlowForEngine keeps numeric menu for legacy', async () => {
    const putBodies: unknown[] = [];
    const openwa = {
      getPlugin: jest.fn().mockResolvedValue({ id: 'zent-flow', enabled: true, config: { passThrough: false } }),
      listPlugins: jest.fn().mockResolvedValue([]),
      apiRequest: jest.fn(async (path: string, method: string, body?: unknown) => {
        if (path.includes('config') && method === 'GET') {
          return { config: { passThrough: true } };
        }
        if (path.includes('config') && method === 'PUT') {
          putBodies.push(body);
          return {};
        }
        return {};
      }),
    };
    const config = { get: jest.fn((_k: string, d?: string) => d ?? 'secret') };
    const service = new OpenwaPluginService(openwa as any, config as any);

    const result = await service.syncZentFlowForEngine('legacy');

    expect(result.passThrough).toBe(false);
    expect(putBodies[0]).toEqual(
      expect.objectContaining({
        config: expect.objectContaining({ passThrough: false, startOnAnyMessage: true }),
      }),
    );
  });
});
