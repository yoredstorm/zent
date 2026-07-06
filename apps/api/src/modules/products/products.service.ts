import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateProductDto,
  UpdateProductDto,
  CreateVariantDto,
  UpdateVariantDto,
} from './dto/product.dto';
import { BotCatalogContextService } from '../bot-ai/bot-catalog-context.service';

const INCLUDE_VARIANTES = {
  values: { include: { attributeValue: { include: { attribute: true } } } },
} as const;

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private botCatalog: BotCatalogContextService,
  ) {}

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
    this.botCatalog.invalidate();
    return product;
  }

  async findAll() {
    return this.prisma.product.findMany({
      where: { isActive: true },
      include: {
        images: { orderBy: { orden: 'asc' } },
        category: true,
        variants: { where: { isActive: true }, include: INCLUDE_VARIANTES },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { orden: 'asc' } },
        category: true,
        attributeValues: { include: { attributeValue: { include: { attribute: true } } } },
        variants: { where: { isActive: true }, include: INCLUDE_VARIANTES },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const variantesActivas = await this.prisma.productVariant.count({
      where: { productId: id, isActive: true },
    });
    const data: any = { ...dto };
    if (variantesActivas > 0) {
      // El stock del padre es la suma de variantes; no se edita a mano
      delete data.stock;
    }
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...data,
        isOutOfStock: data.stock !== undefined ? data.stock <= 0 : undefined,
      },
      include: { images: true, category: true },
    });
    this.botCatalog.invalidate();
    return product;
  }

  async remove(id: string) {
    await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    this.botCatalog.invalidate();
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

  // -------------------------------------------------------------------------
  // Atributos informativos por producto
  // -------------------------------------------------------------------------
  async setAttributes(productId: string, attributeValueIds: string[]) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    await this.prisma.productAttributeValue.deleteMany({ where: { productId } });
    if (attributeValueIds.length) {
      await this.prisma.productAttributeValue.createMany({
        data: attributeValueIds.map((attributeValueId) => ({ productId, attributeValueId })),
        skipDuplicates: true,
      });
    }
    this.botCatalog.invalidate();
    return this.prisma.productAttributeValue.findMany({
      where: { productId },
      include: { attributeValue: { include: { attribute: true } } },
    });
  }

  // -------------------------------------------------------------------------
  // Subproductos (variantes)
  // -------------------------------------------------------------------------
  async findVariants(productId: string) {
    return this.prisma.productVariant.findMany({
      where: { productId },
      include: INCLUDE_VARIANTES,
      orderBy: { createdAt: 'asc' },
    });
  }

  async createVariant(productId: string, dto: CreateVariantDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (!dto.attributeValueIds?.length) {
      throw new BadRequestException('El subproducto necesita al menos un valor de atributo');
    }

    const existentes = await this.prisma.productVariant.findMany({
      where: { productId, isActive: true },
      include: { values: true },
    });
    const combinacionNueva = [...dto.attributeValueIds].sort().join('|');
    const duplicada = existentes.some(
      (v) => v.values.map((vv) => vv.attributeValueId).sort().join('|') === combinacionNueva,
    );
    if (duplicada) {
      throw new ConflictException('Ya existe un subproducto con esa combinación de valores');
    }

    const variant = await this.prisma.productVariant.create({
      data: {
        productId,
        sku: dto.sku || null,
        salePrice: dto.salePrice ?? null,
        stock: dto.stock ?? 0,
        values: {
          create: dto.attributeValueIds.map((attributeValueId) => ({ attributeValueId })),
        },
      },
      include: INCLUDE_VARIANTES,
    });
    await this.recalcularStockPadre(productId);
    this.botCatalog.invalidate();
    return variant;
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto) {
    const existing = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!existing) throw new NotFoundException('Subproducto no encontrado');
    const variant = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        stock: dto.stock,
        salePrice: dto.salePrice,
        sku: dto.sku,
        isActive: dto.isActive,
      },
      include: INCLUDE_VARIANTES,
    });
    await this.recalcularStockPadre(existing.productId);
    this.botCatalog.invalidate();
    return variant;
  }

  async removeVariant(variantId: string) {
    const existing = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!existing) throw new NotFoundException('Subproducto no encontrado');
    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { isActive: false },
    });
    await this.recalcularStockPadre(existing.productId);
    this.botCatalog.invalidate();
    return { success: true };
  }

  /** Si el producto tiene variantes activas, su stock es la suma de ellas. */
  async recalcularStockPadre(productId: string) {
    const agregado = await this.prisma.productVariant.aggregate({
      where: { productId, isActive: true },
      _sum: { stock: true },
    });
    const suma = agregado._sum.stock;
    if (suma === null || suma === undefined) return; // sin variantes: stock manual
    await this.prisma.product.update({
      where: { id: productId },
      data: { stock: suma, isOutOfStock: suma <= 0 },
    });
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

    this.botCatalog.invalidate();
    return this.findOne(id);
  }
}