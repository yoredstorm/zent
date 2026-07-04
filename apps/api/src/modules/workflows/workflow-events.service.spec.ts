import { OPTIONAL_DEPS_METADATA } from '@nestjs/common/constants';
import { WorkflowEventsService } from './workflow-events.service';

describe('WorkflowEventsService', () => {
  it('marks the injectable fetch override as optional for Nest DI', () => {
    const optionalDeps = Reflect.getMetadata(OPTIONAL_DEPS_METADATA, WorkflowEventsService) ?? [];
    expect(optionalDeps).toContain(1);
  });

  it('signs payloads with HMAC SHA256', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    const config = {
      get: (key: string, fallback?: string) =>
        ({
          N8N_WORKFLOWS_ENABLED: 'true',
          N8N_WEBHOOK_BASE_URL: 'https://n8n.example.com/webhook/zent',
          N8N_WEBHOOK_SECRET: 'secret-123',
          N8N_SALES_MODE: 'core',
        })[key] ?? fallback,
    } as any;

    const service = new WorkflowEventsService(config, fetchMock as any);
    await service.emit('order.created', { orderId: 'ord_1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://n8n.example.com/webhook/zent/order.created',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Zent-Event': 'order.created',
          'X-Zent-Signature': expect.stringMatching(/^sha256=/),
        }),
      }),
    );
  });

  it('skips emit when workflows are disabled', async () => {
    const fetchMock = jest.fn();
    const config = {
      get: (key: string, fallback?: string) =>
        key === 'N8N_WORKFLOWS_ENABLED' ? 'false' : fallback,
    } as any;
    const service = new WorkflowEventsService(config, fetchMock as any);
    await service.emit('order.created', { orderId: 'ord_1' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('runs a sales sandbox with fictitious payloads', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
    const config = {
      get: (key: string, fallback?: string) =>
        ({
          N8N_WORKFLOWS_ENABLED: 'true',
          N8N_WEBHOOK_BASE_URL: 'http://n8n:5678/webhook/zent',
          N8N_WEBHOOK_SECRET: 'secret-123',
          N8N_SALES_MODE: 'sandbox',
        })[key] ?? fallback,
    } as any;
    const service = new WorkflowEventsService(config, fetchMock as any);

    const result = await service.runSalesSandbox();

    expect(result.ok).toBe(true);
    expect(result.events.map((event) => event.event)).toEqual([
      'test.ping',
      'order.created',
      'payment.reference_submitted',
      'order.status_changed',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies.every((body) => body.payload.sandbox === true)).toBe(true);
    expect(bodies[1].payload.orderId).toMatch(/^sandbox_/);
  });
});
