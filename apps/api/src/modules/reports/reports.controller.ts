import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('profit')
  @ApiOperation({ summary: 'Get profit report' })
  getProfitReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.getProfitReport(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('profit-by-category')
  @ApiOperation({ summary: 'Get profit by category' })
  getProfitByCategory(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.getProfitByCategory(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Get top selling products' })
  getTopProducts(@Query('limit') limit?: string) {
    return this.reports.getTopProducts(limit ? parseInt(limit) : 10);
  }

  @Get('daily-profit')
  @ApiOperation({ summary: 'Get daily profit for chart' })
  getDailyProfit(@Query('days') days?: string) {
    return this.reports.getDailyProfit(days ? parseInt(days) : 30);
  }
}