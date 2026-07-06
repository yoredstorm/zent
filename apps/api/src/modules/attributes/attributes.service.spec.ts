import { ConflictException, NotFoundException } from '@nestjs/common';
import { AttributesService } from './attributes.service';

describe('AttributesService', () => {
  function createService() {
    const prisma = {
      attribute: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      attributeValue: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    } as any;
    const service = new AttributesService(prisma);
    return { service, prisma };
  }

  it('crea atributo nuevo', async () => {
    const { service, prisma } = createService();
    prisma.attribute.findUnique.mockResolvedValue(null);
    prisma.attribute.create.mockResolvedValue({ id: 'a1', nombre: 'Color', values: [] });
    const res = await service.create({ nombre: 'Color' });
    expect(res.nombre).toBe('Color');
    expect(prisma.attribute.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { nombre: 'Color', orden: 0 } }),
    );
  });

  it('atributo duplicado activo lanza Conflict', async () => {
    const { service, prisma } = createService();
    prisma.attribute.findUnique.mockResolvedValue({ id: 'a1', nombre: 'Color', isActive: true });
    await expect(service.create({ nombre: 'Color' })).rejects.toThrow(ConflictException);
  });

  it('atributo duplicado inactivo se reactiva', async () => {
    const { service, prisma } = createService();
    prisma.attribute.findUnique.mockResolvedValue({
      id: 'a1',
      nombre: 'Color',
      isActive: false,
      orden: 2,
    });
    prisma.attribute.update.mockResolvedValue({ id: 'a1', nombre: 'Color', isActive: true });
    const res = await service.create({ nombre: 'Color' });
    expect(res.isActive).toBe(true);
    expect(prisma.attribute.update).toHaveBeenCalled();
  });

  it('valor duplicado lanza Conflict', async () => {
    const { service, prisma } = createService();
    prisma.attribute.findUnique.mockResolvedValue({ id: 'a1', nombre: 'Color' });
    prisma.attributeValue.findUnique.mockResolvedValue({ id: 'v1', valor: 'Rojo' });
    await expect(service.createValue('a1', { valor: 'Rojo' })).rejects.toThrow(ConflictException);
  });

  it('crea valor nuevo', async () => {
    const { service, prisma } = createService();
    prisma.attribute.findUnique.mockResolvedValue({ id: 'a1', nombre: 'Color' });
    prisma.attributeValue.findUnique.mockResolvedValue(null);
    prisma.attributeValue.create.mockResolvedValue({ id: 'v1', valor: 'Rojo' });
    const res = await service.createValue('a1', { valor: 'Rojo' });
    expect(res.valor).toBe('Rojo');
  });

  it('borrar valor usado por variante lanza Conflict', async () => {
    const { service, prisma } = createService();
    prisma.attributeValue.findUnique.mockResolvedValue({
      id: 'v1',
      valor: 'Rojo',
      _count: { variantValues: 2 },
    });
    await expect(service.removeValue('v1')).rejects.toThrow(ConflictException);
    expect(prisma.attributeValue.delete).not.toHaveBeenCalled();
  });

  it('borrar valor sin uso lo elimina', async () => {
    const { service, prisma } = createService();
    prisma.attributeValue.findUnique.mockResolvedValue({
      id: 'v1',
      valor: 'Rojo',
      _count: { variantValues: 0 },
    });
    prisma.attributeValue.delete.mockResolvedValue({});
    const res = await service.removeValue('v1');
    expect(res.success).toBe(true);
  });

  it('atributo inexistente lanza NotFound', async () => {
    const { service, prisma } = createService();
    prisma.attribute.findUnique.mockResolvedValue(null);
    await expect(service.update('nope', { nombre: 'X' })).rejects.toThrow(NotFoundException);
  });
});
