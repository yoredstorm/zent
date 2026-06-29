import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { ReportsService } from '../reports/reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private analytics: AnalyticsService,
    private reports: ReportsService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Dashboard overview KPIs' })
  getOverview() {
    return this.analytics.getOverview();
  }

  @Get('customers')
  @ApiOperation({ summary: 'Customer analytics' })
  getCustomers() {
    return this.analytics.getCustomerAnalytics();
  }

  @Get('top-customers')
  @ApiOperation({ summary: 'Top customers by spend' })
  getTopCustomers(@Query('limit') limit?: string) {
    return this.analytics.getTopCustomers(limit ? parseInt(limit) : 10);
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Top products by units sold' })
  getTopProducts(@Query('limit') limit?: string) {
    return this.reports.getTopProducts(limit ? parseInt(limit) : 10);
  }

  @Get('sales-trend')
  @ApiOperation({ summary: 'Daily sales trend' })
  getSalesTrend(@Query('days') days?: string) {
    return this.analytics.getSalesTrend(days ? parseInt(days) : 30);
  }

  @Get('new-customers-by-month')
  @ApiOperation({ summary: 'New customers per month' })
  getNewCustomersByMonth(@Query('months') months?: string) {
    return this.analytics.getNewCustomersByMonth(months ? parseInt(months) : 6);
  }
}
