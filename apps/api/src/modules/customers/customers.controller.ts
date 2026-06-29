import { Controller, Get, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { UpdateCustomerDto } from './dto/customer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('customers')
@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Portfolio stats' })
  getStats() {
    return this.customers.getPortfolioStats();
  }

  @Get()
  @ApiOperation({ summary: 'List customers with lifetime stats' })
  findAll(@Query('search') search?: string, @Query('type') type?: string) {
    return this.customers.getListWithStats({ search, type });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Customer detail with order history' })
  findOne(@Param('id') id: string) {
    return this.customers.getDetail(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update customer' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }
}
