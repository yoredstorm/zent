import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  it('getTopProducts separa por variante para saber qué preparar', async () => {
    const prisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            createdAt: new Date(),
            items: [
              {
                productId: 'p1',
                quantity: 3,
                unitPrice: 50,
                costAtSale: 20,
                variantLabel: 'Rojo / M',
                product: { id: 'p1', sku: 'S1', nombre: 'Polo' },
              },
              {
                productId: 'p1',
                quantity: 1,
                unitPrice: 50,
                costAtSale: 20,
                variantLabel: null,
                product: { id: 'p1', sku: 'S1', nombre: 'Polo' },
              },
            ],
          },
        ]),
      },
    } as any;
    const service = new ReportsService(prisma);
    const top = await service.getTopProducts(10);
    expect(top).toHaveLength(2);
    expect(top[0].nombre).toBe('Polo — Rojo / M');
    expect(top[0].totalSold).toBe(3);
    expect(top[0].variantLabel).toBe('Rojo / M');
    expect(top[1].nombre).toBe('Polo');
    expect(top[1].variantLabel).toBeNull();
  });
});
