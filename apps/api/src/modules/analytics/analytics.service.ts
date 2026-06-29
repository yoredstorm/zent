import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { CustomersService } from '../customers/customers.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private reports: ReportsService,
    private customers: CustomersService,
  ) {}

  async getOverview() {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [ordersToday, ordersWeek, ordersMonth, customerStats, topProducts, topCustomers] =
      await Promise.all([
        this.prisma.order.count({
          where: { createdAt: { gte: todayStart }, status: { not: 'CANCELADO' } },
        }),
        this.prisma.order.count({
          where: { createdAt: { gte: weekStart }, status: { not: 'CANCELADO' } },
        }),
        this.prisma.order.count({
          where: { createdAt: { gte: monthStart }, status: { not: 'CANCELADO' } },
        }),
        this.customers.getPortfolioStats(),
        this.reports.getTopProducts(1),
        this.getTopCustomers(1),
      ]);

    const revenueToday = await this.sumRevenueSince(todayStart);
    const revenueMonth = await this.sumRevenueSince(monthStart);

    return {
      orders: { today: ordersToday, week: ordersWeek, month: ordersMonth },
      customers: customerStats,
      revenue: { today: revenueToday, month: revenueMonth },
      topProduct: topProducts[0] ?? null,
      topCustomer: topCustomers[0] ?? null,
    };
  }

  private async sumRevenueSince(since: Date) {
    const orders = await this.prisma.order.findMany({
      where: { createdAt: { gte: since }, status: { not: 'CANCELADO' } },
      select: { total: true },
    });
    return orders.reduce((sum, o) => sum + Number(o.total), 0);
  }

  async getCustomerAnalytics() {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [newToday, newWeek, newMonth, allCustomers] = await Promise.all([
      this.prisma.customer.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.customer.count({ where: { createdAt: { gte: weekStart } } }),
      this.prisma.customer.count({ where: { createdAt: { gte: monthStart } } }),
      this.customers.getListWithStats(),
    ]);

    const returning = allCustomers.filter((c) => c.isReturning).length;
    const newOnly = allCustomers.filter((c) => !c.isReturning).length;

    return {
      newToday,
      newWeek,
      newMonth,
      returning,
      newOnly,
      returningRate: allCustomers.length > 0 ? returning / allCustomers.length : 0,
    };
  }

  async getTopCustomers(limit = 10) {
    const list = await this.customers.getListWithStats();
    return list
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, limit)
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        totalOrders: c.totalOrders,
        totalSpent: c.totalSpent,
      }));
  }

  async getSalesTrend(days = 30) {
    const daily = await this.reports.getDailyProfit(days);
    return daily.map((d) => ({
      date: d.date,
      orders: d.orders,
      revenue: d.revenue,
    }));
  }

  async getNewCustomersByMonth(months = 6) {
    const start = new Date();
    start.setMonth(start.getMonth() - months + 1);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const customers = await this.prisma.customer.findMany({
      where: { createdAt: { gte: start } },
      select: { createdAt: true },
    });

    const map = new Map<string, number>();
    for (const c of customers) {
      const key = `${c.createdAt.getFullYear()}-${String(c.createdAt.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + 1);
    }

    return Array.from(map.entries())
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }
}
