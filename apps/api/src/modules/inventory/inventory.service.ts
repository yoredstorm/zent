import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StockReservationService } from './stock-reservation.service';
import { CartHoldService } from './cart-hold.service';
import { AbandonedCartService } from './abandoned-cart.service';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private stock: StockReservationService,
    private cartHold: CartHoldService,
    private abandonedCart: AbandonedCartService,
    private realtime: RealtimeService,
  ) {}

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
    return products.map((p) => ({
      ...p,
      id: String(p.id),
      categoryNombre: p.category.nombre,
    }));
  }

  async getLiveStock() {
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

    const rows = await Promise.all(
      products.map(async (p) => {
        const reservadoPedidos = await this.stock.getOrderReservedQuantity(p.id);
        const reservadoCarritos = await this.stock.getCartReservedQuantity(p.id);
        const disponible = Math.max(0, p.stock - reservadoPedidos - reservadoCarritos);
        return {
          id: String(p.id),
          sku: p.sku,
          nombre: p.nombre,
          stockFisico: p.stock,
          reservadoPedidos,
          reservadoCarritos,
          disponible,
          minStock: p.minStock,
          isOutOfStock: p.isOutOfStock,
          categoryNombre: p.category.nombre,
        };
      }),
    );

    return rows;
  }

  async getActiveCarts() {
    return this.cartHold.listActiveHolds();
  }

  getAbandonedCarts() {
    return this.abandonedCart.listAbandonedCarts();
  }

  async getLowStockAlerts() {
    const live = await this.getLiveStock();
    return live
      .filter((p) => p.disponible <= p.minStock)
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        nombre: p.nombre,
        stock: p.disponible,
        stockFisico: p.stockFisico,
        minStock: p.minStock,
        categoryNombre: p.categoryNombre,
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

    await this.prisma.$transaction([
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

    this.realtime.publish('stock.changed', { productId, action: 'adjust' });
  }
}
