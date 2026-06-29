import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { UpdateOrderStatusDto } from './dto/order.dto';
import { OpenwaService } from '../openwa/openwa.service';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private openwa: OpenwaService,
  ) {}

  async findAll(filters?: { status?: string; source?: string }) {
    return this.prisma.order.findMany({
      where: {
        ...(filters?.status && { status: filters.status as any }),
        ...(filters?.source && { source: filters.source as any }),
      },
      include: {
        customer: true,
        items: { include: { product: { include: { images: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
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
    customerId?: string;
    chatId?: string;
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
          customerId: data.customerId,
          chatId: data.chatId,
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
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        const newStock = (product?.stock ?? 0) - item.quantity;
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { decrement: item.quantity },
            isOutOfStock: newStock <= 0,
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
    const order = await this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.deliveryCost !== undefined && { deliveryCost: dto.deliveryCost }),
        ...(dto.paymentMethod && { paymentMethod: dto.paymentMethod }),
        ...(dto.notes && { notes: dto.notes }),
      },
      include: { items: true },
    });

    if (dto.status === 'COMPLETADO' && order.chatId) {
      try {
        await this.openwa.sendText({
          chatId: order.chatId,
          text: `✅ Tu pedido #${order.id.slice(0, 8)} fue entregado. ¡Gracias por tu compra! 🙏\n\nEscribe *menu* para hacer un nuevo pedido.`,
        });
      } catch {
        // OpenWA may be unavailable; order status still updated
      }
    }

    return order;
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
