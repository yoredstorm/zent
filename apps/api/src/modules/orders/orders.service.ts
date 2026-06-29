import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { UpdateOrderStatusDto } from './dto/order.dto';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: { status?: string; source?: string }) {
    return this.prisma.order.findMany({
      where: {
        ...(filters?.status && { status: filters.status as any }),
        ...(filters?.source && { source: filters.source as any }),
      },
      include: {
        items: { include: { product: { include: { images: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { product: { include: { images: true } } } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async create(data: {
    customerName: string;
    customerPhone: string;
    address?: string;
    reference?: string;
    items: { productId: string; quantity: number; unitPrice: number; costAtSale: number }[];
  }) {
    const subtotal = data.items.reduce((sum, item) => sum + item.quantity * Number(item.unitPrice), 0);
    const total = subtotal;

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          address: data.address,
          reference: data.reference,
          subtotal,
          total,
          source: 'WHATSAPP',
          status: 'NUEVO',
          items: {
            create: data.items,
          },
        },
        include: { items: true },
      });

      for (const item of data.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { decrement: item.quantity },
            isOutOfStock: true,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId,
            type: 'OUT',
            quantity: item.quantity,
            reason: `Pedido ${order.id}`,
            orderId: order.id,
          },
        });
      }

      return order;
    });
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    return this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.deliveryCost !== undefined && { deliveryCost: dto.deliveryCost }),
        ...(dto.paymentMethod && { paymentMethod: dto.paymentMethod }),
        ...(dto.notes && { notes: dto.notes }),
      },
      include: { items: true },
    });
  }

  async getStats() {
    const [total, byStatus, today, week, month] = await Promise.all([
      this.prisma.order.count(),
      this.prisma.order.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
      this.prisma.order.count({
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
    ]);

    return { total, byStatus, today, week, month };
  }
}