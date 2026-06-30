import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, Prisma } from '@prisma/client';

/** Pedido del cliente confirmado; stock reservado, aún no descontado. */
export const PENDING_ORDER_STATUSES: OrderStatus[] = ['NUEVO', 'EN_GESTION'];

/** Pedido aceptado por el asesor; stock descontado del inventario. */
export const ACCEPTED_ORDER_STATUSES: OrderStatus[] = ['CONFIRMADO', 'EN_DELIVERY', 'COMPLETADO'];

type Tx = Prisma.TransactionClient;

@Injectable()
export class StockReservationService {
  constructor(private prisma: PrismaService) {}

  async getReservedQuantity(productId: string, excludeOrderId?: string): Promise<number> {
    const result = await this.prisma.orderItem.aggregate({
      where: {
        productId,
        order: {
          status: { in: PENDING_ORDER_STATUSES },
          stockCommitted: false,
          ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
        },
      },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  async getAvailableStock(productId: string, excludeOrderId?: string): Promise<number> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) return 0;
    const reserved = await this.getReservedQuantity(productId, excludeOrderId);
    return Math.max(0, product.stock - reserved);
  }

  async assertAvailable(
    productId: string,
    quantity: number,
    excludeOrderId?: string,
    productName?: string,
  ): Promise<void> {
    const available = await this.getAvailableStock(productId, excludeOrderId);
    if (quantity > available) {
      const label = productName ? `"${productName}"` : 'el producto';
      throw new BadRequestException(
        `Stock insuficiente para ${label}: disponible ${available}, solicitado ${quantity}`,
      );
    }
  }

  async assertOrderItemsAvailable(
    items: { productId: string; quantity: number }[],
    excludeOrderId?: string,
  ): Promise<void> {
    for (const item of items) {
      if (item.quantity <= 0) continue;
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
      await this.assertAvailable(
        item.productId,
        item.quantity,
        excludeOrderId,
        product?.nombre,
      );
    }
  }

  async commitOrderStock(orderId: string, tx?: Tx): Promise<void> {
    const db = tx ?? this.prisma;
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || order.stockCommitted) return;

    for (const item of order.items) {
      if (item.quantity <= 0) continue;
      const product = await db.product.findUnique({ where: { id: item.productId } });
      if ((product?.stock ?? 0) < item.quantity) {
        throw new BadRequestException(
          `No hay stock suficiente para confirmar el pedido (${product?.nombre ?? item.productId})`,
        );
      }
      const stockAfter = (product?.stock ?? 0) - item.quantity;
      await db.product.update({
        where: { id: item.productId },
        data: {
          stock: { decrement: item.quantity },
          isOutOfStock: stockAfter <= 0,
        },
      });
      await db.inventoryMovement.create({
        data: {
          productId: item.productId,
          type: 'OUT',
          quantity: item.quantity,
          reason: `Pedido aceptado ${orderId}`,
          orderId,
        },
      });
    }

    await db.order.update({
      where: { id: orderId },
      data: { stockCommitted: true },
    });
  }

  async restoreOrderStock(orderId: string, tx?: Tx): Promise<void> {
    const db = tx ?? this.prisma;
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order || !order.stockCommitted) return;

    for (const item of order.items) {
      if (item.quantity <= 0) continue;
      const product = await db.product.findUnique({ where: { id: item.productId } });
      const stockAfter = (product?.stock ?? 0) + item.quantity;
      await db.product.update({
        where: { id: item.productId },
        data: {
          stock: { increment: item.quantity },
          isOutOfStock: stockAfter <= 0,
        },
      });
      await db.inventoryMovement.create({
        data: {
          productId: item.productId,
          type: 'IN',
          quantity: item.quantity,
          reason: `Pedido cancelado ${orderId}`,
          orderId,
        },
      });
    }

    await db.order.update({
      where: { id: orderId },
      data: { stockCommitted: false },
    });
  }

  shouldCommitStock(prev: OrderStatus, next: OrderStatus, stockCommitted: boolean): boolean {
    if (stockCommitted || next === 'CANCELADO') return false;
    return (
      PENDING_ORDER_STATUSES.includes(prev) &&
      ACCEPTED_ORDER_STATUSES.includes(next)
    );
  }

  shouldRestoreStock(prev: OrderStatus, next: OrderStatus, stockCommitted: boolean): boolean {
    return next === 'CANCELADO' && prev !== 'CANCELADO' && stockCommitted;
  }
}
