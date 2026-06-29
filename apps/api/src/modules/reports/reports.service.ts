import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getProfitReport(startDate?: Date, endDate?: Date) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { not: 'CANCELADO' },
        ...(startDate && { createdAt: { gte: startDate } }),
        ...(endDate && { createdAt: { lte: endDate } }),
      },
      include: { items: true },
    });

    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;

    for (const order of orders) {
      for (const item of order.items) {
        const revenue = Number(item.unitPrice) * item.quantity;
        const cost = Number(item.costAtSale) * item.quantity;
        totalRevenue += revenue;
        totalCost += cost;
        totalProfit += revenue - cost;
      }
    }

    return { totalRevenue, totalCost, totalProfit, orderCount: orders.length };
  }

  async getProfitByCategory(startDate?: Date, endDate?: Date) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { not: 'CANCELADO' },
        ...(startDate && { createdAt: { gte: startDate } }),
        ...(endDate && { createdAt: { lte: endDate } }),
      },
      include: {
        items: {
          include: {
            product: { include: { category: true } },
          },
        },
      },
    });

    const categoryMap = new Map<string, { category: string; revenue: number; cost: number; profit: number; orderCount: number }>();

    for (const order of orders) {
      for (const item of order.items) {
        const catName = item.product.category.nombre;
        const existing = categoryMap.get(catName) || { category: catName, revenue: 0, cost: 0, profit: 0, orderCount: 0 };
        existing.revenue += Number(item.unitPrice) * item.quantity;
        existing.cost += Number(item.costAtSale) * item.quantity;
        existing.profit += (Number(item.unitPrice) - Number(item.costAtSale)) * item.quantity;
        existing.orderCount += 1;
        categoryMap.set(catName, existing);
      }
    }

    return Array.from(categoryMap.values()).sort((a, b) => b.profit - a.profit);
  }

  async getTopProducts(limit: number = 10, startDate?: Date, endDate?: Date) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: { not: 'CANCELADO' },
        ...(startDate && { createdAt: { gte: startDate } }),
        ...(endDate && { createdAt: { lte: endDate } }),
      },
      include: {
        items: {
          include: { product: true },
        },
      },
    });

    const productMap = new Map<string, { id: string; sku: string; nombre: string; totalSold: number; revenue: number; profit: number }>();

    for (const order of orders) {
      for (const item of order.items) {
        const existing = productMap.get(item.productId) || {
          id: String(item.product.id),
          sku: item.product.sku,
          nombre: item.product.nombre,
          totalSold: 0,
          revenue: 0,
          profit: 0,
        };
        existing.totalSold += item.quantity;
        existing.revenue += Number(item.unitPrice) * item.quantity;
        existing.profit += (Number(item.unitPrice) - Number(item.costAtSale)) * item.quantity;
        productMap.set(item.productId, existing);
      }
    }

    return Array.from(productMap.values())
      .sort((a, b) => b.totalSold - a.totalSold)
      .slice(0, limit);
  }

  async getDailyProfit(days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const orders = await this.prisma.order.findMany({
      where: {
        status: { not: 'CANCELADO' },
        createdAt: { gte: startDate },
      },
      include: { items: true },
    });

    const dailyMap = new Map<string, { date: string; revenue: number; cost: number; profit: number; orders: number }>();

    for (const order of orders) {
      const dateKey = order.createdAt.toISOString().split('T')[0];
      const existing = dailyMap.get(dateKey) || { date: dateKey, revenue: 0, cost: 0, profit: 0, orders: 0 };
      
      for (const item of order.items) {
        existing.revenue += Number(item.unitPrice) * item.quantity;
        existing.cost += Number(item.costAtSale) * item.quantity;
        existing.profit += (Number(item.unitPrice) - Number(item.costAtSale)) * item.quantity;
      }
      existing.orders += 1;
      dailyMap.set(dateKey, existing);
    }

    return Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }
}