import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { AdjustStockDto } from './dto/inventory.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Get('stock')
  @ApiOperation({ summary: 'Get current stock levels' })
  getCurrentStock() {
    return this.inventory.getCurrentStock();
  }

  @Get('stock/live')
  @ApiOperation({ summary: 'Stock with reservations (physical, carts, orders, available)' })
  getLiveStock() {
    return this.inventory.getLiveStock();
  }

  @Get('active-carts')
  @ApiOperation({ summary: 'Active WhatsApp carts holding stock' })
  getActiveCarts() {
    return this.inventory.getActiveCarts();
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get low stock alerts' })
  getLowStockAlerts() {
    return this.inventory.getLowStockAlerts();
  }

  @Get('movements')
  @ApiOperation({ summary: 'Get inventory movements' })
  getMovements(@Query('productId') productId?: string) {
    return this.inventory.getMovements(productId);
  }

  @Post('adjust')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Adjust stock' })
  adjustStock(@Body() dto: AdjustStockDto) {
    return this.inventory.adjustStock(dto.productId, dto.quantity, dto.reason);
  }
}