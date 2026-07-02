import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { BotCatalogContextService } from '../bot-ai/bot-catalog-context.service';

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private botCatalog: BotCatalogContextService,
  ) {}

  async create(dto: CreateCategoryDto) {
    const category = await this.prisma.category.create({ data: dto });
    this.botCatalog.invalidate();
    return category;
  }

  async findAll() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      include: { _count: { select: { products: true } } },
      orderBy: { orden: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { products: { where: { isActive: true, stock: { gt: 0 } } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.update({ where: { id }, data: dto });
    this.botCatalog.invalidate();
    return category;
  }

  async remove(id: string) {
    await this.prisma.category.update({ where: { id }, data: { isActive: false } });
    this.botCatalog.invalidate();
    return { success: true };
  }
}