import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCustomerDto } from './dto/customer.dto';

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async findByPhone(phone: string) {
    return this.prisma.customer.findUnique({
      where: { phone: normalizePhone(phone) },
    });
  }

  async upsertFromOrder(data: {
    customerName: string;
    customerPhone: string;
    address?: string;
    reference?: string;
  }) {
    const phone = normalizePhone(data.customerPhone);
    const now = new Date();
    const existing = await this.prisma.customer.findUnique({ where: { phone } });

    if (existing) {
      return this.prisma.customer.update({
        where: { phone },
        data: {
          name: data.customerName,
          address: data.address ?? existing.address,
          reference: data.reference ?? existing.reference,
          lastOrderAt: now,
          firstOrderAt: existing.firstOrderAt ?? now,
        },
      });
    }

    return this.prisma.customer.create({
      data: {
        phone,
        name: data.customerName,
        address: data.address,
        reference: data.reference,
        firstOrderAt: now,
        lastOrderAt: now,
      },
    });
  }

  async backfillFromOrders() {
    const orders = await this.prisma.order.findMany({
      where: { customerId: null },
      orderBy: { createdAt: 'asc' },
    });

    for (const order of orders) {
      const customer = await this.upsertFromOrder({
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        address: order.address ?? undefined,
        reference: order.reference ?? undefined,
      });
      await this.prisma.order.update({
        where: { id: order.id },
        data: { customerId: customer.id },
      });
    }

    return { migrated: orders.length };
  }

  async getPortfolioStats() {
    const customers = await this.prisma.customer.findMany({
      include: {
        orders: { where: { status: { not: 'CANCELADO' } } },
      },
    });

    let returning = 0;
    let newCustomers = 0;
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    for (const c of customers) {
      const count = c.orders.length;
      if (count > 1) returning++;
      if (c.createdAt >= monthStart) newCustomers++;
    }

    return {
      total: customers.length,
      returning,
      newThisMonth: newCustomers,
      returningRate: customers.length > 0 ? returning / customers.length : 0,
    };
  }

  async getListWithStats(filters?: { search?: string; type?: string }) {
    const customers = await this.prisma.customer.findMany({
      where: filters?.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { phone: { contains: normalizePhone(filters.search) } },
            ],
          }
        : undefined,
      include: {
        orders: {
          where: { status: { not: 'CANCELADO' } },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { lastOrderAt: 'desc' },
    });

    const mapped = customers.map((c) => {
      const totalOrders = c.orders.length;
      const totalSpent = c.orders.reduce((sum, o) => sum + Number(o.total), 0);
      const lastOrder = c.orders[0];
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        reference: c.reference,
        firstOrderAt: c.firstOrderAt,
        lastOrderAt: c.lastOrderAt,
        totalOrders,
        totalSpent,
        avgOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
        isReturning: totalOrders > 1,
        isVip: totalOrders >= 5,
        lastOrderStatus: lastOrder?.status ?? null,
        lastOrderDate: lastOrder?.createdAt ?? null,
      };
    });

    if (filters?.type === 'new') {
      return mapped.filter((c) => c.totalOrders === 1);
    }
    if (filters?.type === 'returning') {
      return mapped.filter((c) => c.totalOrders > 1);
    }
    return mapped;
  }

  async getDetail(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        orders: {
          where: { status: { not: 'CANCELADO' } },
          include: {
            items: { include: { product: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const productCounts = new Map<string, { nombre: string; quantity: number }>();
    let totalSpent = 0;
    for (const order of customer.orders) {
      totalSpent += Number(order.total);
      for (const item of order.items) {
        const key = item.productId;
        const existing = productCounts.get(key) || { nombre: item.product.nombre, quantity: 0 };
        existing.quantity += item.quantity;
        productCounts.set(key, existing);
      }
    }

    const topProducts = Array.from(productCounts.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    return {
      ...customer,
      totalOrders: customer.orders.length,
      totalSpent,
      avgOrderValue: customer.orders.length > 0 ? totalSpent / customer.orders.length : 0,
      topProducts,
    };
  }

  async update(id: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.prisma.customer.update({ where: { id }, data: dto });
  }
}
