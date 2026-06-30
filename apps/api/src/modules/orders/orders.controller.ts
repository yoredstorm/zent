import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { UpdateOrderStatusDto, CreateOrderDto, UpdateOrderItemsDto } from './dto/order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('orders')
@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.VENDEDOR, Role.AGENTE)
  @ApiOperation({ summary: 'Create order manually (dashboard / asesor)' })
  create(@Body() dto: CreateOrderDto) {
    return this.orders.createFromDashboard(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all orders' })
  findAll(@Query('status') status?: string, @Query('source') source?: string) {
    return this.orders.findAll({ status, source });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get order statistics' })
  getStats() {
    return this.orders.getStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  findOne(@Param('id') id: string) {
    return this.orders.findOne(id);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.updateStatus(id, dto);
  }

  @Put(':id/items')
  @Roles(Role.ADMIN, Role.VENDEDOR, Role.AGENTE)
  @ApiOperation({ summary: 'Confirm or adjust order line quantities' })
  updateItems(@Param('id') id: string, @Body() dto: UpdateOrderItemsDto) {
    return this.orders.updateItems(id, dto);
  }
}