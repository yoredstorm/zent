import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderSource, OrderStatus } from '@prisma/client';
import { UpdateOrderStatusDto, CreateOrderDto, UpdateOrderItemsDto } from './dto/order.dto';
import { OpenwaService } from '../openwa/openwa.service';
import { CustomersService } from '../customers/customers.service';
import { buildStatusNotifyMessage } from './order-notify.util';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private prisma: PrismaService,
    private openwa: OpenwaService,
    private customers: CustomersService,
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

  async createFromDashboard(dto: CreateOrderDto) {
    const lineItems: {
      productId: string;
      quantity: number;
      unitPrice: number;
      costAtSale: number;
      nombre: string;
    }[] = [];

    for (const item of dto.items) {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
      if (!product || !product.isActive) {
        throw new BadRequestException(`Producto no encontrado: ${item.productId}`);
      }
      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Stock insuficiente para "${product.nombre}": hay ${product.stock}, pediste ${item.quantity}`,
        );
      }
      lineItems.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: Number(product.salePrice),
        costAtSale: Number(product.costPrice),
        nombre: product.nombre,
      });
    }

    let customerId = dto.customerId;
    if (!customerId) {
      const customer = await this.customers.upsertFromOrder({
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        address: dto.address,
        reference: dto.reference,
      });
      customerId = customer.id;
    }

    const order = await this.create({
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      address: dto.address,
      reference: dto.reference,
      customerId,
      chatId: dto.chatId,
      notes: dto.notes,
      source: 'DASHBOARD',
      items: lineItems.map(({ productId, quantity, unitPrice, costAtSale }) => ({
        productId,
        quantity,
        unitPrice,
        costAtSale,
      })),
    });

    if (dto.chatId) {
      try {
        const summary = lineItems.map((i) => `• ${i.quantity}x ${i.nombre}`).join('\n');
        await this.openwa.sendText({
          chatId: dto.chatId,
          text:
            `✅ Tu pedido #${order.id.slice(0, 8)} fue registrado por un asesor.\n\n` +
            `${summary}\n` +
            `💰 Total: S/ ${Number(order.total).toFixed(2)}\n\n` +
            'Te contactaremos pronto para coordinar el envío.',
        });
      } catch {
        // OpenWA unavailable; order still created
      }
    }

    return this.findOne(order.id);
  }

  async create(data: {
    customerName: string;
    customerPhone: string;
    address?: string;
    reference?: string;
    customerId?: string;
    chatId?: string;
    notes?: string;
    source?: OrderSource;
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
          notes: data.notes,
          subtotal,
          total,
          source: data.source ?? 'WHATSAPP',
          status: 'NUEVO',
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              requestedQuantity: item.quantity,
              unitPrice: item.unitPrice,
              costAtSale: item.costAtSale,
            })),
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

  async updateItems(id: string, dto: UpdateOrderItemsDto) {
    const order = await this.findOne(id);
    if (order.status === 'COMPLETADO' || order.status === 'CANCELADO') {
      throw new BadRequestException('No se pueden modificar ítems de un pedido cerrado');
    }

    const itemMap = new Map(order.items.map((item) => [item.id, item]));
    for (const line of dto.items) {
      if (!itemMap.has(line.id)) {
        throw new BadRequestException(`Ítem no encontrado: ${line.id}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const line of dto.items) {
        const existing = itemMap.get(line.id)!;
        const delta = line.quantity - existing.quantity;
        if (delta === 0) continue;

        if (delta > 0) {
          const product = await tx.product.findUnique({ where: { id: existing.productId } });
          if ((product?.stock ?? 0) < delta) {
            throw new BadRequestException(
              `Stock insuficiente para ajustar "${product?.nombre ?? existing.productId}"`,
            );
          }
        }

        await tx.orderItem.update({
          where: { id: existing.id },
          data: {
            quantity: line.quantity,
            requestedQuantity: existing.requestedQuantity ?? existing.quantity,
          },
        });

        if (delta !== 0) {
          const product = await tx.product.findUnique({ where: { id: existing.productId } });
          const stockAfter = (product?.stock ?? 0) - delta;
          await tx.product.update({
            where: { id: existing.productId },
            data: {
              ...(delta > 0
                ? { stock: { decrement: delta } }
                : { stock: { increment: Math.abs(delta) } }),
              isOutOfStock: stockAfter <= 0,
            },
          });
          await tx.inventoryMovement.create({
            data: {
              productId: existing.productId,
              type: delta < 0 ? 'IN' : 'OUT',
              quantity: Math.abs(delta),
              reason: `Ajuste pedido ${order.id}`,
              orderId: order.id,
            },
          });
        }
      }

      const updatedItems = await tx.orderItem.findMany({ where: { orderId: id } });
      const subtotal = updatedItems.reduce(
        (sum, item) => sum + item.quantity * Number(item.unitPrice),
        0,
      );
      const delivery = order.deliveryCost != null ? Number(order.deliveryCost) : 0;

      await tx.order.update({
        where: { id },
        data: { subtotal, total: subtotal + delivery },
      });
    });

    return this.findOne(id);
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    const previous = await this.findOne(id);

    const order = await this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.deliveryCost !== undefined && { deliveryCost: dto.deliveryCost }),
        ...(dto.paymentMethod && { paymentMethod: dto.paymentMethod }),
        ...(dto.notes && { notes: dto.notes }),
        ...(dto.deliveryCost !== undefined && {
          total: Number(previous.subtotal) + dto.deliveryCost,
        }),
      },
      include: { items: { include: { product: true } } },
    });

    if (dto.status && dto.status !== previous.status) {
      await this.notifyCustomerStatusChange(order, dto.status);
    }

    return order;
  }

  private resolveChatId(order: { chatId?: string | null; customerPhone: string }): string | null {
    if (order.chatId?.trim()) return order.chatId.trim();
    const digits = order.customerPhone.replace(/\D/g, '');
    if (digits.length >= 9) return `${digits}@c.us`;
    return null;
  }

  private async notifyCustomerStatusChange(
    order: {
      id: string;
      customerName: string;
      customerPhone: string;
      address?: string | null;
      chatId?: string | null;
      subtotal: { toString(): string };
      total: { toString(): string };
      deliveryCost?: { toString(): string } | null;
      items: Array<{
        quantity: number;
        requestedQuantity?: number | null;
        unitPrice: { toString(): string };
        product?: { nombre: string } | null;
      }>;
    },
    status: OrderStatus,
  ) {
    const chatId = this.resolveChatId(order);
    if (!chatId) return;

    const text = buildStatusNotifyMessage(status, order);
    if (!text) return;

    try {
      await this.openwa.sendText({ chatId, text });
    } catch (err) {
      this.logger.warn(`WhatsApp notify failed for order ${order.id} (${status}): ${err}`);
    }
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
