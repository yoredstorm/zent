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
          category: { id: 'cat_1', nombre: 'Bebidas' },
          images: [{ url: 'https://img.test/cafe.png' }],
        },
      ]),
      findUnique: jest.fn().mockResolvedValue({
        id: 'prod_1',
        isActive: true,
        salePrice: { toString: () => '12.5' },
        costPrice: { toString: () => '7' },
      }),
    };
    const prisma = {
      category: {
        findMany: categories.findAll,
      },
      product: products,
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
    const openwa = { sendText: jest.fn().mockResolvedValue(undefined) };
    const controller = new N8nCommerceToolsController(
      prisma as any,
      orders as any,
      openwa as any,
    );
    return { controller, categories, products, prisma, orders, openwa };
  }

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
          category: 'Bebidas',
          imageUrl: 'https://img.test/cafe.png',
        },
      ],
    });
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

  it('rejects phone lookups without a customer phone', async () => {
    const { controller } = createController();

    await expect(controller.findOrdersByPhone({ customerPhone: '' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
