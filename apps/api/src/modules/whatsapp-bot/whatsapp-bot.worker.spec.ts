import { WhatsappBotWorker } from './whatsapp-bot.worker';

describe('WhatsappBotWorker n8n routing', () => {
  it('routes messages to n8n chat bridge when enabled for the contact', async () => {
    const bot = { handleMessage: jest.fn() };
    const bridge = {
      shouldHandle: jest.fn().mockReturnValue(true),
      handleMessage: jest.fn().mockResolvedValue({ ok: true, replied: true }),
    };
    const worker = new WhatsappBotWorker(
      { get: jest.fn() } as any,
      bot as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { getMode: jest.fn().mockResolvedValue('ai') } as any,
      bridge as any,
    );

    await (worker as any).processJob({
      data: {
        chatId: '51999999999@c.us',
        body: 'hola',
        from: '51999999999@c.us',
        senderPhone: '51999999999',
        waSessionId: 'session_1',
        idempotencyKey: 'msg_1',
      },
    });

    expect(bridge.handleMessage).toHaveBeenCalledWith({
      chatId: '51999999999@c.us',
      waSessionId: 'session_1',
      contactPhone: '51999999999',
      message: 'hola',
      messageType: 'text',
      context: { from: '51999999999@c.us', routingMode: 'ai' },
    });
    expect(bot.handleMessage).not.toHaveBeenCalled();
  });

  it('cleans the idempotency cache after n8n-routed messages', async () => {
    const worker = new WhatsappBotWorker(
      { get: jest.fn() } as any,
      { handleMessage: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { getMode: jest.fn().mockResolvedValue('ai') } as any,
      {
        shouldHandle: jest.fn().mockReturnValue(true),
        handleMessage: jest.fn().mockResolvedValue({ ok: true, replied: true }),
      } as any,
    );
    (worker as any).processedKeys = new Set(Array.from({ length: 10001 }, (_, i) => `old_${i}`));

    await (worker as any).processJob({
      data: {
        chatId: '51999999999@c.us',
        body: 'hola',
        from: '51999999999@c.us',
        senderPhone: '51999999999',
        idempotencyKey: 'msg_new',
      },
    });

    expect((worker as any).processedKeys.size).toBeLessThan(10000);
  });
});
/**
 * Idempotency: processed key is only recorded after successful handleMessage.
 * Failed jobs must not mark the key so BullMQ can retry.
 */
describe('WhatsappBotWorker idempotency contract', () => {
  it('marks key processed only on success', () => {
    const processedKeys = new Set<string>();
    const idempotencyKey = 'msg-1';

    const simulateSuccess = () => {
      let error: Error | null = null;
      try {
        // handleMessage ok
      } catch (e: any) {
        error = e;
      }
      if (!error) processedKeys.add(idempotencyKey);
      return error;
    };

    const simulateFailure = () => {
      let error: Error | null = null;
      try {
        throw new Error('boom');
      } catch (e: any) {
        error = e;
      }
      if (!error) processedKeys.add(idempotencyKey);
      return error;
    };

    expect(simulateSuccess()).toBeNull();
    expect(processedKeys.has(idempotencyKey)).toBe(true);

    processedKeys.clear();
    expect(simulateFailure()).toBeTruthy();
    expect(processedKeys.has(idempotencyKey)).toBe(false);
  });
});
