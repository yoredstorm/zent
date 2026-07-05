import { N8nSessionToolsService } from './n8n-session-tools.service';

describe('N8nSessionToolsService', () => {
  function createService() {
    const customers = {
      findByPhone: jest.fn().mockResolvedValue({
        id: 'cust-1',
        name: 'Ana',
        address: 'Av. 1',
        phone: '51999',
        reference: 'Ref',
      }),
    };
    const chatSession = {
      getContext: jest.fn().mockResolvedValue({ n8nFlow: { phase: 'cart' } }),
      peek: jest.fn().mockResolvedValue({ state: 'MENU_PRINCIPAL' }),
      updateContext: jest.fn().mockResolvedValue(undefined),
      updateState: jest.fn().mockResolvedValue(undefined),
      updateCustomerData: jest.fn().mockResolvedValue(undefined),
    };
    const cart = {
      getCart: jest.fn().mockResolvedValue({ items: [], subtotal: 0, deliveryCost: 0, total: 0 }),
      getTtlSeconds: jest.fn().mockReturnValue(1800),
    };
    const config = {
      get: (key: string, fallback?: string) =>
        ({ STORE_NAME: 'Mi Tienda' })[key] ?? fallback,
    };
    const prisma = {
      storeSettings: {
        findFirst: jest.fn().mockResolvedValue({ storeName: 'Mi Tienda' }),
      },
      order: {
        count: jest.fn().mockResolvedValue(3),
        findFirst: jest.fn().mockResolvedValue({
          id: 'ord-active',
          status: 'NUEVO',
          total: { toString: () => '50' },
          createdAt: new Date(),
          items: [{ product: { nombre: 'Cafe' }, quantity: 1 }],
        }),
      },
    };
    const vendorNotify = { notifyHandoffRequest: jest.fn().mockResolvedValue(undefined) };

    const service = new N8nSessionToolsService(
      chatSession as any,
      customers as any,
      cart as any,
      config as any,
      prisma as any,
      vendorNotify as any,
    );

    return { service, customers, chatSession, cart, prisma, vendorNotify };
  }

  it('bootstrap resets stuck flow to greeting on hola', async () => {
    const { service } = createService();
    const res = await service.bootstrap({
      chatId: 'c1',
      stateKey: 's::c1',
      contactPhone: '51999',
      message: 'hola',
    });
    expect(res.flow.phase).toBe('greeting');
  });

  it('bootstrap returns customer, flow phase, cart and botPaused', async () => {
    const { service } = createService();
    const res = await service.bootstrap({
      chatId: 'c1',
      stateKey: 's::c1',
      contactPhone: '51999',
    });
    expect(res.customer.name).toBe('Ana');
    expect(res.flow.phase).toBe('cart');
    expect(res.botPaused).toBe(false);
    expect(res.storeName).toBe('Mi Tienda');
    expect(res.cartTtlMinutes).toBe(30);
  });

  it('patch merges n8nFlow phase', async () => {
    const { service, chatSession } = createService();
    await service.patchFlow('c1', { phase: 'checkout_confirm' });
    expect(chatSession.updateContext).toHaveBeenCalledWith('c1', {
      n8nFlow: expect.objectContaining({ phase: 'checkout_confirm' }),
    });
  });

  it('handoff sets HANDOFF_HUMANO and notifies vendor', async () => {
    const { service, chatSession, vendorNotify } = createService();
    await service.handoff('sess::chat1', { contactPhone: '51999999999', customerName: 'Ana' });
    expect(chatSession.updateState).toHaveBeenCalledWith('sess::chat1', 'HANDOFF_HUMANO');
    expect(vendorNotify.notifyHandoffRequest).toHaveBeenCalled();
  });

  it('resumeBot resets to greeting', async () => {
    const { service, chatSession } = createService();
    const res = await service.resumeBot('c1');
    expect(chatSession.updateState).toHaveBeenCalledWith('c1', 'MENU_PRINCIPAL');
    expect(res.botPaused).toBe(false);
  });

  it('lookupCustomer includes totalOrders for returning customers', async () => {
    const { service } = createService();
    const res = await service.lookupCustomer('51999999999');
    expect(res.found).toBe(true);
    if (res.found) {
      expect(res.totalOrders).toBe(3);
      expect(res.isReturning).toBe(true);
    }
  });

  it('findActiveOrderByPhone returns active order', async () => {
    const { service } = createService();
    const res = await service.findActiveOrderByPhone('51999999999');
    expect(res.found).toBe(true);
    if (res.found) {
      expect(res.order.status).toBe('NUEVO');
    }
  });
});
