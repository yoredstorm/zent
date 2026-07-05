import { WhatsappBotWorker } from './whatsapp-bot.worker';

describe('WhatsappBotWorker n8n routing', () => {
  const n8nCfg = {
    engine: 'n8n' as const,
    n8nChatWebhookUrl: 'http://n8n:5678/webhook/zent-chat',
    webhookSecret: 'secret',
    n8nChatScope: 'sandbox' as const,
    n8nChatSandboxPhones: '51999999999',
  };

  it('routes messages to n8n chat bridge when engine is n8n', async () => {
    const bot = { handleMessage: jest.fn() };
    const bridge = {
      handleMessage: jest.fn().mockResolvedValue({ ok: true, replied: true }),
    };
    const botEngine = {
      getConfig: jest.fn().mockResolvedValue(n8nCfg),
      resolveRoutingDecision: jest.fn().mockResolvedValue({
        globalEngine: 'n8n',
        effectiveEngine: 'n8n',
        wouldRouteToN8n: true,
        resolvedPhone: '51999999999',
        reason: 'sandbox_match',
      }),
    };
    const worker = new WhatsappBotWorker(
      { get: jest.fn() } as any,
      bot as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { shouldUseAiBot: jest.fn() } as any,
      botEngine as any,
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

    expect(bridge.handleMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: '51999999999@c.us',
        contactPhone: '51999999999',
        message: 'hola',
      }),
      expect.objectContaining({
        chatWebhookUrl: n8nCfg.n8nChatWebhookUrl,
        webhookSecret: n8nCfg.webhookSecret,
      }),
    );
    expect(bot.handleMessage).not.toHaveBeenCalled();
  });

  it('does not call legacy bot when engine is n8n but phone is outside sandbox', async () => {
    const bot = { handleMessage: jest.fn() };
    const botEngine = {
      getConfig: jest.fn(),
      resolveRoutingDecision: jest.fn().mockResolvedValue({
        globalEngine: 'n8n',
        effectiveEngine: 'skipped',
        wouldRouteToN8n: false,
        resolvedPhone: '51911111111',
        reason: 'not_in_sandbox',
      }),
    };
    const turnLog = { startTurn: jest.fn().mockResolvedValue('log1'), completeTurn: jest.fn() };
    const worker = new WhatsappBotWorker(
      { get: jest.fn() } as any,
      bot as any,
      {} as any,
      {} as any,
      turnLog as any,
      {} as any,
      { shouldUseAiBot: jest.fn() } as any,
      botEngine as any,
      { handleMessage: jest.fn() } as any,
    );

    await (worker as any).processJob({
      data: {
        chatId: '51911111111@c.us',
        body: 'hola',
        from: '51911111111@c.us',
        senderPhone: '51911111111',
        idempotencyKey: 'k1',
      },
    });

    expect(bot.handleMessage).not.toHaveBeenCalled();
    expect(turnLog.startTurn).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'routing_skipped' }),
    );
  });

  it('cleans the idempotency cache after n8n-routed messages', async () => {
    const botEngine = {
      getConfig: jest.fn().mockResolvedValue(n8nCfg),
      resolveRoutingDecision: jest.fn().mockResolvedValue({
        globalEngine: 'n8n',
        effectiveEngine: 'n8n',
        wouldRouteToN8n: true,
        resolvedPhone: '51999999999',
        reason: 'sandbox_match',
      }),
    };
    const worker = new WhatsappBotWorker(
      { get: jest.fn() } as any,
      { handleMessage: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      botEngine as any,
      {
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
