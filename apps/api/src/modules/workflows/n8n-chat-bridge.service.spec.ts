import { N8nChatBridgeService } from './n8n-chat-bridge.service';

describe('N8nChatBridgeService', () => {
  function createService(fetchMock = jest.fn()) {
    const config = {
      get: (key: string, fallback?: string) =>
        ({
          N8N_CHAT_WEBHOOK_URL: 'http://n8n:5678/webhook/zent-chat',
          N8N_WEBHOOK_SECRET: 'secret-123',
          N8N_CHAT_MODE: 'core',
          N8N_CHAT_TIMEOUT_MS: '2500',
        })[key] ?? fallback,
    } as any;
    const openwa = {
      sendText: jest.fn().mockResolvedValue(undefined),
      sendImage: jest.fn().mockResolvedValue(undefined),
      sendDocument: jest.fn().mockResolvedValue(undefined),
    };
    const turnLog = {
      startTurn: jest.fn().mockResolvedValue('log_1'),
      completeTurn: jest.fn().mockResolvedValue(undefined),
      failTurn: jest.fn().mockResolvedValue(undefined),
    };
    const sessionTools = {
      bootstrap: jest.fn().mockResolvedValue({
        customer: { found: false },
        flow: { phase: 'greeting' },
        cart: { items: [], subtotal: 0, deliveryCost: 0, total: 0 },
        cartTtlMinutes: 30,
        storeName: 'Ohana',
        localHour: 10,
        botPaused: false,
      }),
      handoff: jest.fn().mockResolvedValue({ ok: true, botPaused: true }),
      patchFlow: jest.fn().mockResolvedValue({ phase: 'main_menu' }),
    };
    return {
      service: new N8nChatBridgeService(
        config,
        openwa as any,
        turnLog as any,
        sessionTools as any,
        fetchMock as any,
      ),
      openwa,
      turnLog,
      sessionTools,
    };
  }

  it('sends inbound chat to n8n and relays the reply', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: 'Tenemos café disponible.' }),
      text: async () => '',
    });
    const { service, openwa } = createService(fetchMock);

    const result = await service.handleMessage({
      chatId: '51999999999@c.us',
      waSessionId: 'session_1',
      contactPhone: '51999999999',
      message: 'hola',
    });

    expect(result).toEqual({ ok: true, replied: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://n8n:5678/webhook/zent-chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-Zent-Signature': expect.stringMatching(/^sha256=/),
        }),
        body: expect.stringContaining('"zentApiUrl":"http://backend-api:3000/api"'),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(openwa.sendText).toHaveBeenCalledWith({
      chatId: '51999999999@c.us',
      sessionId: 'session_1',
      text: 'Tenemos café disponible.',
    });
  });

  it('enriches payload with session bootstrap context', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: 'Hola' }),
      text: async () => '',
    });
    const { service, sessionTools } = createService(fetchMock);

    await service.handleMessage({
      chatId: '51999999999@c.us',
      waSessionId: 'session_1',
      contactPhone: '51999999999',
      message: 'hola',
    });

    expect(sessionTools.bootstrap).toHaveBeenCalledWith({
      chatId: 'session_1::51999999999@c.us',
      stateKey: 'session_1::51999999999@c.us',
      contactPhone: '51999999999',
      message: 'hola',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.context.session).toBeDefined();
    expect(body.context.stateKey).toBe('session_1::51999999999@c.us');
  });

  it('triggers handoff when n8n response includes handoff:true', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: 'Un asesor te atenderá.', handoff: true }),
      text: async () => '',
    });
    const { service, sessionTools } = createService(fetchMock);

    await service.handleMessage({
      chatId: '51999999999@c.us',
      waSessionId: 'session_1',
      contactPhone: '51999999999',
      message: 'asesor',
    });

    expect(sessionTools.handoff).toHaveBeenCalledWith(
      'session_1::51999999999@c.us',
      expect.objectContaining({ contactPhone: '51999999999' }),
    );
  });

  it('sends media attachments returned by n8n before the text reply', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        reply: 'Producto agregado.',
        media: [
          { type: 'image', url: 'https://cdn.test/product.png', caption: 'Papel grueso' },
        ],
      }),
      text: async () => '',
    });
    const { service, openwa } = createService(fetchMock);

    await service.handleMessage({
      chatId: '51987752653@lid',
      waSessionId: 'session_1',
      contactPhone: '51987752653',
      message: 'agrega 5 papel',
    });

    expect(openwa.sendImage).toHaveBeenCalledWith({
      chatId: '51987752653@lid',
      sessionId: 'session_1',
      image: { url: 'https://cdn.test/product.png' },
      caption: 'Papel grueso',
      source: 'bot',
    });
    expect(openwa.sendText).toHaveBeenCalledWith({
      chatId: '51987752653@lid',
      sessionId: 'session_1',
      text: 'Producto agregado.',
    });
  });

  it('falls back to greeting+menu when n8n fails on hola', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('fetch failed'));
    const { service, openwa, sessionTools } = createService(fetchMock);

    const result = await service.handleMessage({
      chatId: '51999999999@c.us',
      waSessionId: 'session_1',
      contactPhone: '51999999999',
      message: 'hola',
    });

    expect(result.ok).toBe(false);
    expect(result.replied).toBe(true);
    expect(result.metadata?.localGreetingFallback).toBe(true);
    expect(openwa.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(/Ohana.*Catálogo.*Mi pedido/s),
      }),
    );
    expect(sessionTools.patchFlow).toHaveBeenCalledWith('session_1::51999999999@c.us', {
      phase: 'main_menu',
    });
  });

  it('uses technical fallback for non-greeting when n8n fails', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('404 Not Found'));
    const { service, openwa } = createService(fetchMock);

    await service.handleMessage({
      chatId: '51999999999@c.us',
      waSessionId: 'session_1',
      contactPhone: '51999999999',
      message: 'quiero el catalogo de zapatos',
    });

    expect(openwa.sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringMatching(/problema técnico/i),
      }),
    );
  });

  it('does not handle messages when chat mode is enabled without a signing secret', () => {
    const fetchMock = jest.fn();
    const config = {
      get: (key: string, fallback?: string) =>
        ({ N8N_CHAT_MODE: 'core', N8N_WEBHOOK_SECRET: '' })[key] ?? fallback,
    } as any;
    const service = new N8nChatBridgeService(
      config,
      { sendText: jest.fn() } as any,
      { startTurn: jest.fn(), completeTurn: jest.fn(), failTurn: jest.fn() } as any,
      { bootstrap: jest.fn(), handoff: jest.fn() } as any,
      fetchMock as any,
    );

    expect(service.shouldHandle('51999999999')).toBe(false);
  });
});
