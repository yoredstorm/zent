import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';

describe('ProductsService — atributos y variantes', () => {
  function createService() {
    const prisma = {
      product: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      productAttributeValue: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      productVariant: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
      $transaction: jest.fn(async (ops: any) => (Array.isArray(ops) ? Promise.all(ops) : ops(prisma))),
    } as any;
    const botCatalog = { invalidate: jest.fn() } as any;
    const service = new ProductsService(prisma, botCatalog);
    return { service, prisma };
  }

  const varianteRoja = {
    id: 'v1',
    productId: 'p1',
    stock: 3,
    isActive: true,
    values: [{ attributeValueId: 'av-rojo', attributeValue: { valor: 'Rojo', attribute: { nombre: 'Color' } } }],
  };

  it('setAttributes reemplaza asignaciones', async () => {
    const { service, prisma } = createService();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1' });
    await service.setAttributes('p1', ['av1', 'av2']);
    expect(prisma.productAttributeValue.deleteMany).toHaveBeenCalledWith({
      where: { productId: 'p1' },
    });
    expect(prisma.productAttributeValue.createMany).toHaveBeenCalledWith({
      data: [
        { productId: 'p1', attributeValueId: 'av1' },
        { productId: 'p1', attributeValueId: 'av2' },
      ],
      skipDuplicates: true,
    });
  });

  it('createVariant con combinación duplicada lanza Conflict', async () => {
    const { service, prisma } = createService();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.productVariant.findMany.mockResolvedValue([varianteRoja]);
    await expect(
      service.createVariant('p1', { attributeValueIds: ['av-rojo'], stock: 5 }),
    ).rejects.toThrow(ConflictException);
  });

  it('createVariant nueva recalcula stock del padre', async () => {
    const { service, prisma } = createService();
    prisma.product.findUnique.mockResolvedValue({ id: 'p1' });
    prisma.productVariant.findMany.mockResolvedValue([]);
    prisma.productVariant.create.mockResolvedValue({ ...varianteRoja, stock: 5 });
    prisma.productVariant.aggregate.mockResolvedValue({ _sum: { stock: 5 } });
    await service.createVariant('p1', { attributeValueIds: ['av-rojo'], stock: 5 });
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: expect.objectContaining({ stock: 5, isOutOfStock: false }),
      }),
    );
  });

  it('recalcularStockPadre suma variantes activas', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.aggregate.mockResolvedValue({ _sum: { stock: 7 } });
    await service.recalcularStockPadre('p1');
    expect(prisma.productVariant.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 'p1', isActive: true } }),
    );
    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p1' }, data: { stock: 7, isOutOfStock: false } }),
    );
  });

  it('recalcularStockPadre sin variantes no toca el stock', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.aggregate.mockResolvedValue({ _sum: { stock: null } });
    await service.recalcularStockPadre('p1');
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('update ignora stock manual si el producto tiene variantes activas', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.count = jest.fn().mockResolvedValue(2);
    prisma.product.update.mockResolvedValue({ id: 'p1' });
    await service.update('p1', { stock: 99 } as any);
    const data = prisma.product.update.mock.calls[0][0].data;
    expect(data.stock).toBeUndefined();
  });

  it('update aplica stock manual si el producto no tiene variantes', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.count = jest.fn().mockResolvedValue(0);
    prisma.product.update.mockResolvedValue({ id: 'p1' });
    await service.update('p1', { stock: 99 } as any);
    const data = prisma.product.update.mock.calls[0][0].data;
    expect(data.stock).toBe(99);
    expect(data.isOutOfStock).toBe(false);
  });

  it('updateVariant inexistente lanza NotFound', async () => {
    const { service, prisma } = createService();
    prisma.productVariant.findUnique.mockResolvedValue(null);
    await expect(service.updateVariant('nope', { stock: 1 })).rejects.toThrow(NotFoundException);
  });
});
