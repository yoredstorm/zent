import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async getCurrentStock() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        sku: true,
        nombre: true,
        stock: true,
        minStock: true,
        isOutOfStock: true,
        category: { select: { nombre: true } },
      },
      orderBy: { nombre: 'asc' },
    });
    return products.map(p => ({
      ...p,
      id: String(p.id),
      categoryNombre: p.category.nombre,
    }));
  }

  async getLowStockAlerts() {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        sku: true,
        nombre: true,
        stock: true,
        minStock: true,
        category: { select: { nombre: true } },
      },
    });
    return products
      .filter(p => p.stock <= p.minStock)
      .map(p => ({
        id: String(p.id),
        sku: p.sku,
        nombre: p.nombre,
        stock: p.stock,
        minStock: p.minStock,
        categoryNombre: p.category.nombre,
      }));
  }

  async getMovements(productId?: string) {
    return this.prisma.inventoryMovement.findMany({
      where: productId ? { productId } : undefined,
      include: {
        product: { select: { sku: true, nombre: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async adjustStock(productId: string, quantity: number, reason: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const newStock = product.stock + quantity;
    if (newStock < 0) throw new BadRequestException('Insufficient stock');

    return this.prisma.$transaction([
      this.prisma.product.update({
        where: { id: productId },
        data: { stock: newStock, isOutOfStock: newStock <= 0 },
      }),
      this.prisma.inventoryMovement.create({
        data: {
          productId,
          type: quantity > 0 ? 'IN' : 'OUT',
          quantity: Math.abs(quantity),
          reason,
        },
      }),
    ]);
  }
}