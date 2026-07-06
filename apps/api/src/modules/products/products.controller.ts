import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import {
  CreateProductDto,
  UpdateProductDto,
  UploadImageDto,
  SetProductAttributesDto,
  CreateVariantDto,
  UpdateVariantDto,
} from './dto/product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('products')
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Create product' })
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all products' })
  findAll() {
    return this.products.findAll();
  }

  @Get('with-stock')
  @ApiOperation({ summary: 'List products with stock (for WhatsApp bot)' })
  findWithStock() {
    return this.products.findWithStock();
  }

  @Get('category/:categoryId')
  @ApiOperation({ summary: 'List products by category' })
  findByCategory(@Param('categoryId') categoryId: string) {
    return this.products.findByCategory(categoryId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Update product' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete product (soft)' })
  remove(@Param('id') id: string) {
    return this.products.remove(id);
  }

  @Post(':id/images')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Upload product image' })
  uploadImage(@Param('id') id: string, @Body() dto: UploadImageDto) {
    return this.products.uploadImage(id, dto.url, dto.orden);
  }

  @Delete('images/:imageId')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Delete product image' })
  deleteImage(@Param('imageId') imageId: string) {
    return this.products.deleteImage(imageId);
  }

  @Put(':id/attributes')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Asignar valores de atributo (informativos) al producto' })
  setAttributes(@Param('id') id: string, @Body() dto: SetProductAttributesDto) {
    return this.products.setAttributes(id, dto.attributeValueIds);
  }

  @Get(':id/variants')
  @ApiOperation({ summary: 'Listar subproductos del producto' })
  findVariants(@Param('id') id: string) {
    return this.products.findVariants(id);
  }

  @Post(':id/variants')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Crear subproducto (combinación + stock + precio opcional)' })
  createVariant(@Param('id') id: string, @Body() dto: CreateVariantDto) {
    return this.products.createVariant(id, dto);
  }

  @Put('variants/:variantId')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Actualizar subproducto' })
  updateVariant(@Param('variantId') variantId: string, @Body() dto: UpdateVariantDto) {
    return this.products.updateVariant(variantId, dto);
  }

  @Delete('variants/:variantId')
  @Roles(Role.ADMIN, Role.VENDEDOR)
  @ApiOperation({ summary: 'Desactivar subproducto' })
  removeVariant(@Param('variantId') variantId: string) {
    return this.products.removeVariant(variantId);
  }
}