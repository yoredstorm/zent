import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProductDto) {
    const product = await this.prisma.product.create({
      data: {
        sku: dto.sku,
        nombre: dto.nombre,
        descripcion: dto.descripcion,
        categoryId: dto.categoryId,
        costPrice: dto.costPrice,
        salePrice: dto.salePrice,
        stock: dto.stock || 0,
        minStock: dto.minStock || 0,
      },
      include: { images: true, category: true },
    });
    return product;
  }

  async findAll() {
    return this.prisma.product.findMany({
      where: { isActive: true },
      include: { images: { orderBy: { orden: 'asc' } }, category: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { images: { orderBy: { orden: 'asc' } }, category: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        isOutOfStock: dto.stock !== undefined ? dto.stock <= 0 : undefined,
      },
      include: { images: true, category: true },
    });
    return product;
  }

  async remove(id: string) {
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
  }

  async findWithStock() {
    return this.prisma.product.findMany({
      where: { isActive: true, stock: { gt: 0 } },
      include: { images: { orderBy: { orden: 'asc' } }, category: true },
      orderBy: { nombre: 'asc' },
    });
  }

  async findByCategory(categoryId: string) {
    return this.prisma.product.findMany({
      where: { categoryId, isActive: true, stock: { gt: 0 } },
      include: { images: { orderBy: { orden: 'asc' } }, category: true },
    });
  }

  async uploadImage(productId: string, url: string, orden: number = 0) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');

    const image = await this.prisma.productImage.create({
      data: { productId, url, orden },
    });
    return image;
  }

  async deleteImage(id: string) {
    await this.prisma.productImage.delete({ where: { id } });
    return { success: true };
  }

  async adjustStock(id: string, quantity: number, reason: string) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    const newStock = product.stock + quantity;
    if (newStock < 0) throw new BadRequestException('Insufficient stock');

    await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id },
        data: { stock: newStock, isOutOfStock: newStock <= 0 },
      }),
      this.prisma.inventoryMovement.create({
        data: {
          productId: id,
          type: quantity > 0 ? 'IN' : 'OUT',
          quantity: Math.abs(quantity),
          reason,
        },
      }),
    ]);

    return this.findOne(id);
  }
}