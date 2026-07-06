import { N8nCommerceToolsController } from './n8n-commerce-tools.controller';
import { BadRequestException } from '@nestjs/common';

describe('N8nCommerceToolsController', () => {
  function createController() {
    const categories = {
      findAll: jest.fn().mockResolvedValue([{ id: 'cat_1', nombre: 'Bebidas', _count: { products: 2 } }]),
    };
    const products = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'prod_1',
          nombre: 'Cafe',
          descripcion: 'Cafe molido',
          salePrice: { toString: () => '12.5' },
          costPrice: { toString: () => '7' },
          stock: 5,
          minStock: 3,
          category: { id: 'cat_1', nombre: 'Bebidas' },
          images: [{ url: 'https://img.test/cafe.png' }],
        },
      ]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'prod_1',
        nombre: 'Cafe',
        isActive: true,
        stock: 10,
        salePrice: { toString: () => '12.5' },
        costPrice: { toString: () => '7' },
      }),
    };
    const productVariant = {
      findUnique: jest.fn().mockResolvedValue(null),
    };
    const prisma = {
      category: {
        findMany: categories.findAll,
      },
      product: products,
      productVariant,
      catalogPdf: {
        findFirst: jest.fn().mockResolvedValue({ id: 'pdf_1', url: 'https://cdn.test/catalog.pdf' }),
      },
    };
    const orders = {
      create: jest.fn().mockResolvedValue({ id: 'ord_1', status: 'NUEVO', total: { toString: () => '25' } }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'ord_1', status: 'NUEVO', total: { toString: () => '25' } }),
      updateStatus: jest.fn().mockResolvedValue({ id: 'ord_1', status: 'CONFIRMADO' }),
    };
    const openwa = {
      sendText: jest.fn().mockResolvedValue(undefined),
      sendDocument: jest.fn().mockResolvedValue(undefined),
      sendImage: jest.fn().mockResolvedValue(undefined),
    };
    const customers = {
      upsertFromOrder: jest.fn().mockResolvedValue({ id: 'cust-1', phone: '51999999999', name: 'Ana' }),
    };
    const cartService = {
      getCart: jest.fn().mockResolvedValue({ items: [], subtotal: 0, deliveryCost: 0, total: 0 }),
      addItem: jest.fn().mockResolvedValue({
        items: [{ productId: 'p1', nombre: 'Arroz', quantity: 1, unitPrice: 10 }],
        subtotal: 10,
        deliveryCost: 5,
        total: 15,
      }),
      removeItem: jest.fn().mockResolvedValue({ items: [], subtotal: 0, deliveryCost: 0, total: 0 }),
      clearCart: jest.fn().mockResolvedValue(undefined),
      getTtlSeconds: jest.fn().mockReturnValue(1800),
    };
    const cartHold = {
      syncFromCart: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      getHeldQuantity: jest.fn().mockResolvedValue(0),
    };
    const sessionTools = {
      bootstrap: jest.fn(),
      patchFlow: jest.fn(),
      handoff: jest.fn(),
      resumeBot: jest.fn(),
      lookupCustomer: jest.fn(),
      findActiveOrderByPhone: jest.fn(),
    };
    const controller = new N8nCommerceToolsController(
      prisma as any,
      orders as any,
      openwa as any,
      customers as any,
      cartService as any,
      cartHold as any,
      sessionTools as any,
    );
    return {
      controller,
      categories,
      products,
      productVariant,
      prisma,
      orders,
      openwa,
      customers,
      cartService,
      cartHold,
      sessionTools,
    };
  }

  it('catalog_pdf.send delivers active PDF through OpenWA', async () => {
    const { controller, openwa } = createController();
    const result = await controller.sendCatalogPdf({
      chatId: '51987752653@lid',
      waSessionId: 'session_1',
    });
    expect(result).toEqual({
      available: true,
      sent: true,
      url: 'https://cdn.test/catalog.pdf',
    });
    expect(openwa.sendDocument).toHaveBeenCalledWith({
      chatId: '51987752653@lid',
      sessionId: 'session_1',
      document: {
        url: 'https://cdn.test/catalog.pdf',
        mimetype: 'application/pdf',
        filename: 'catalogo.pdf',
      },
      caption: '📋 Catálogo completo',
      source: 'bot',
    });
  });

  it('products.send_image delivers product photo through OpenWA', async () => {
    const { controller, openwa, products } = createController();
    products.findUnique.mockResolvedValueOnce({
      id: 'prod_1',
      nombre: 'Cafe',
      salePrice: { toString: () => '12.5' },
      images: [{ url: 'https://img.test/cafe.png' }],
    });
    const result = await controller.sendProductImage({
      chatId: '51987752653@lid',
      waSessionId: 'session_1',
      productId: 'prod_1',
    });
    expect(result.sent).toBe(true);
    expect(openwa.sendImage).toHaveBeenCalledWith({
      chatId: '51987752653@lid',
      sessionId: 'session_1',
      image: { url: 'https://img.test/cafe.png' },
      caption: '*Cafe* — S/ 12.50',
      source: 'bot',
    });
  });

  it('returns chat-ready categories and products', async () => {
    const { controller } = createController();

    await expect(controller.listCategories()).resolves.toEqual({
      categories: [{ id: 'cat_1', name: 'Bebidas', productCount: 2 }],
    });
    await expect(controller.searchProducts({ query: 'caf' })).resolves.toEqual({
      products: [
        {
          id: 'prod_1',
          name: 'Cafe',
          description: 'Cafe molido',
          price: 12.5,
          stock: 5,
          minStock: 3,
          lowStock: false,
          category: 'Bebidas',
          imageUrl: 'https://img.test/cafe.png',
          atributos: null,
          variantes: [],
        },
      ],
    });
  });

  it('productForChat expone atributos y variantes con stock', () => {
    const { controller } = createController();
    const result = (controller as any).productForChat({
      id: 'p1',
      nombre: 'Polo',
      descripcion: '',
      salePrice: 50,
      stock: 5,
      minStock: 1,
      category: { nombre: 'Ropa' },
      images: [],
      attributeValues: [
        { attributeValue: { valor: 'Faber', attribute: { nombre: 'Marca' } } },
        { attributeValue: { valor: '2 kg', attribute: { nombre: 'Peso' } } },
      ],
      variants: [
        {
          id: 'v1',
          stock: 3,
          salePrice: null,
          values: [
            { attributeValue: { valor: 'Rojo', attribute: { nombre: 'Color' } } },
            { attributeValue: { valor: 'M', attribute: { nombre: 'Talla' } } },
          ],
        },
        {
          id: 'v2',
          stock: 0,
          salePrice: 60,
          values: [{ attributeValue: { valor: 'Azul', attribute: { nombre: 'Color' } } }],
        },
      ],
    });
    expect(result.atributos).toBe('Marca: Faber · Peso: 2 kg');
    expect(result.variantes).toEqual([{ id: 'v1', etiqueta: 'Rojo / M', precio: 50, stock: 3 }]);
  });

  it('cart.add_item con variantId valida stock y usa precio de la variante', async () => {
    const { controller, cartService, productVariant } = createController();
    productVariant.findUnique.mockResolvedValue({
      id: 'v1',
      productId: 'prod_1',
      isActive: true,
      stock: 4,
      salePrice: { toString: () => '15' },
      values: [{ attributeValue: { valor: 'Rojo' } }],
    });
    await controller.cartAddItem({
      stateKey: 'sess::chat1',
      chatId: 'chat1',
      productId: 'prod_1',
      quantity: 2,
      variantId: 'v1',
    });
    expect(cartService.addItem).toHaveBeenCalledWith(
      'sess::chat1',
      expect.objectContaining({
        variantId: 'v1',
        variantLabel: 'Rojo',
        nombre: 'Cafe (Rojo)',
        unitPrice: 15,
      }),
    );
  });

  it('cart.add_item con variante sin stock rechaza', async () => {
    const { controller, cartService, productVariant } = createController();
    productVariant.findUnique.mockResolvedValue({
      id: 'v1',
      productId: 'prod_1',
      isActive: true,
      stock: 1,
      salePrice: null,
      values: [{ attributeValue: { valor: 'Rojo' } }],
    });
    await expect(
      controller.cartAddItem({
        stateKey: 'sess::chat1',
        chatId: 'chat1',
        productId: 'prod_1',
        quantity: 3,
        variantId: 'v1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(cartService.addItem).not.toHaveBeenCalled();
  });

  it('create_from_chat propaga variantId y variantLabel al pedido', async () => {
    const { controller, orders, productVariant } = createController();
    productVariant.findUnique.mockResolvedValue({
      id: 'v1',
      productId: 'prod_1',
      isActive: true,
      stock: 4,
      salePrice: null,
      values: [{ attributeValue: { valor: 'Rojo' } }],
    });
    await controller.createOrderFromChat({
      chatId: 'chat1',
      customerName: 'Ana',
      customerPhone: '51999999999',
      items: [{ productId: 'prod_1', quantity: 2, variantId: 'v1' }],
    });
    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({ productId: 'prod_1', variantId: 'v1', variantLabel: 'Rojo' }),
        ],
      }),
    );
  });

  it('productForChat marks lowStock when stock <= minStock', () => {
    const { controller } = createController();
    const result = (controller as any).productForChat({
      id: 'p1',
      nombre: 'Arroz',
      descripcion: '',
      salePrice: 10,
      stock: 2,
      minStock: 5,
      category: { nombre: 'Granos' },
      images: [],
    });
    expect(result.lowStock).toBe(true);
    expect(result.stock).toBe(2);
    expect(result.minStock).toBe(5);
  });

  it('cart.add_item syncs hold and returns ttl', async () => {
    const { controller, cartService, cartHold } = createController();
    const res = await controller.cartAddItem({
      stateKey: 'sess::chat1',
      chatId: 'chat1',
      contactPhone: '51999999999',
      productId: 'p1',
      quantity: 1,
    });
    expect(res.cart.total).toBe(15);
    expect(res.reservedMinutes).toBe(30);
    expect(cartHold.syncFromCart).toHaveBeenCalled();
    expect(cartService.addItem).toHaveBeenCalled();
  });

  it('creates orders through OrdersService so stock rules stay centralized', async () => {
    const { controller, orders } = createController();
    const result = await controller.createOrderFromChat({
      chatId: '51999999999@c.us',
      customerName: 'Cliente Test',
      customerPhone: '51999999999',
      address: 'Av Test 123',
      items: [{ productId: 'prod_1', quantity: 2 }],
    });

    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'WHATSAPP',
        chatId: '51999999999@c.us',
        customerId: 'cust-1',
        items: [
          {
            productId: 'prod_1',
            quantity: 2,
            unitPrice: 12.5,
            costAtSale: 7,
          },
        ],
      }),
    );
    expect(result).toEqual({ orderId: 'ord_1', status: 'NUEVO', total: 25 });
  });

  it('create_from_chat upserts customer and links customerId', async () => {
    const { controller, customers, orders } = createController();

    await controller.createOrderFromChat({
      chatId: 'chat1',
      customerName: 'Ana',
      customerPhone: '51999999999',
      address: 'Av. Larco 123',
      reference: 'Portón azul',
      items: [{ productId: 'prod_1', quantity: 2 }],
    });

    expect(customers.upsertFromOrder).toHaveBeenCalledWith({
      customerName: 'Ana',
      customerPhone: '51999999999',
      address: 'Av. Larco 123',
      reference: 'Portón azul',
    });
    expect(orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        address: 'Av. Larco 123',
        reference: 'Portón azul',
      }),
    );
  });

  it('rejects order items with non-positive quantities', async () => {
    const { controller, orders } = createController();

    await expect(
      controller.createOrderFromChat({
        chatId: '51999999999@c.us',
        customerName: 'Cliente Test',
        customerPhone: '51999999999',
        items: [{ productId: 'prod_1', quantity: 0 }],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(orders.create).not.toHaveBeenCalled();
  });

  it('rejects invalid order status updates', async () => {
    const { controller, orders } = createController();

    await expect(
      controller.updateOrderStatus({ orderId: 'ord_1', status: 'BAD_STATUS' as any }),
    ).rejects.toThrow(BadRequestException);
    expect(orders.updateStatus).not.toHaveBeenCalled();
  });

  it('rejects status lookups without an order id', async () => {
    const { controller } = createController();

    await expect(controller.getOrderStatus({ orderId: '' })).rejects.toThrow(BadRequestException);
  });

  it('orders.get_status devuelve updatedAt e items con variantLabel', async () => {
    const { controller, prisma } = createController();
    const updatedAt = new Date('2026-07-05T10:00:00Z');
    (prisma as any).order = {
      findFirst: jest.fn().mockResolvedValue({
        id: '9375c821-aaaa-bbbb-cccc-dddddddddddd',
        status: 'EN_DELIVERY',
        total: { toString: () => '100' },
        customerPhone: '51999999999',
        createdAt: new Date('2026-07-04T10:00:00Z'),
        updatedAt,
        items: [
          { quantity: 2, variantLabel: 'Rojo / M', product: { nombre: 'Polo' } },
          { quantity: 1, variantLabel: null, product: { nombre: 'Polo' } },
        ],
      }),
    };

    const result = await controller.getOrderStatus({ orderId: '9375c821' });

    expect(result.updatedAt).toEqual(updatedAt);
    expect(result.items).toEqual([
      { productName: 'Polo', quantity: 2, variantLabel: 'Rojo / M' },
      { productName: 'Polo', quantity: 1, variantLabel: null },
    ]);
  });

  it('rejects phone lookups without a customer phone', async () => {
    const { controller } = createController();

    await expect(controller.findOrdersByPhone({ customerPhone: '' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
