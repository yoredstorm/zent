import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CatalogPdfService {
  constructor(private prisma: PrismaService) {}

  async getActive() {
    const pdf = await this.prisma.catalogPdf.findFirst({ where: { isActive: true } });
    if (!pdf) throw new NotFoundException('No active catalog PDF');
    return pdf;
  }

  async upload(url: string) {
    await this.prisma.catalogPdf.updateMany({ data: { isActive: false } });
    return this.prisma.catalogPdf.create({ data: { url, isActive: true } });
  }

  async deactivate(id: string) {
    return this.prisma.catalogPdf.update({ where: { id }, data: { isActive: false } });
  }
}