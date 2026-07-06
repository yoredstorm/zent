import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAttributeDto,
  UpdateAttributeDto,
  CreateAttributeValueDto,
  UpdateAttributeValueDto,
} from './dto/attribute.dto';

@Injectable()
export class AttributesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.attribute.findMany({
      where: { isActive: true },
      include: { values: { orderBy: { orden: 'asc' } } },
      orderBy: { orden: 'asc' },
    });
  }

  async create(dto: CreateAttributeDto) {
    const existing = await this.prisma.attribute.findUnique({ where: { nombre: dto.nombre } });
    if (existing) {
      if (!existing.isActive) {
        return this.prisma.attribute.update({
          where: { id: existing.id },
          data: { isActive: true, orden: dto.orden ?? existing.orden },
          include: { values: true },
        });
      }
      throw new ConflictException(`El atributo "${dto.nombre}" ya existe`);
    }
    return this.prisma.attribute.create({
      data: { nombre: dto.nombre, orden: dto.orden ?? 0 },
      include: { values: true },
    });
  }

  async update(id: string, dto: UpdateAttributeDto) {
    const attribute = await this.prisma.attribute.findUnique({ where: { id } });
    if (!attribute) throw new NotFoundException('Atributo no encontrado');
    return this.prisma.attribute.update({
      where: { id },
      data: dto,
      include: { values: { orderBy: { orden: 'asc' } } },
    });
  }

  async remove(id: string) {
    const attribute = await this.prisma.attribute.findUnique({ where: { id } });
    if (!attribute) throw new NotFoundException('Atributo no encontrado');
    await this.prisma.attribute.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  async createValue(attributeId: string, dto: CreateAttributeValueDto) {
    const attribute = await this.prisma.attribute.findUnique({ where: { id: attributeId } });
    if (!attribute) throw new NotFoundException('Atributo no encontrado');
    const existing = await this.prisma.attributeValue.findUnique({
      where: { attributeId_valor: { attributeId, valor: dto.valor } },
    });
    if (existing) {
      throw new ConflictException(`El valor "${dto.valor}" ya existe en ${attribute.nombre}`);
    }
    return this.prisma.attributeValue.create({
      data: { attributeId, valor: dto.valor, orden: dto.orden ?? 0 },
    });
  }

  async updateValue(valueId: string, dto: UpdateAttributeValueDto) {
    const value = await this.prisma.attributeValue.findUnique({ where: { id: valueId } });
    if (!value) throw new NotFoundException('Valor no encontrado');
    return this.prisma.attributeValue.update({ where: { id: valueId }, data: dto });
  }

  async removeValue(valueId: string) {
    const value = await this.prisma.attributeValue.findUnique({
      where: { id: valueId },
      include: { _count: { select: { variantValues: true } } },
    });
    if (!value) throw new NotFoundException('Valor no encontrado');
    if (value._count.variantValues > 0) {
      throw new ConflictException(
        'Este valor está en uso por uno o más subproductos. Elimina primero esos subproductos.',
      );
    }
    await this.prisma.attributeValue.delete({ where: { id: valueId } });
    return { success: true };
  }
}
