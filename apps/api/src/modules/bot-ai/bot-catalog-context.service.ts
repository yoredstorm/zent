import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StockReservationService } from '../inventory/stock-reservation.service';

@Injectable()
export class BotCatalogContextService {
  private cachedSummary: string | null = null;
  private cachedAt = 0;
  private readonly ttlMs = 120_000;

  constructor(
    private prisma: PrismaService,
    private stock: StockReservationService,
  ) {}

  invalidate() {
    this.cachedSummary = null;
    this.cachedAt = 0;
  }

  async getCatalogSummary(force = false): Promise<string> {
    const now = Date.now();
    if (!force && this.cachedSummary && now - this.cachedAt < this.ttlMs) {
      return this.cachedSummary;
    }

    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { orden: 'asc' },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { nombre: 'asc' },
          select: {
            id: true,
            nombre: true,
            salePrice: true,
            descripcion: true,
            minStock: true,
          },
        },
      },
    });

    const lines: string[] = [];
    for (const cat of categories) {
      const availableProducts: string[] = [];
      for (const p of cat.products) {
        const available = await this.stock.getAvailableStock(p.id);
        if (available <= 0) continue;
        const low = available <= p.minStock ? ' (pocas unidades)' : '';
        availableProducts.push(
          `- [${p.id}] ${p.nombre} — S/ ${Number(p.salePrice).toFixed(2)} — stock: ${available}${low}`,
        );
      }
      if (availableProducts.length > 0) {
        lines.push(`## ${cat.nombre} (${cat.id})`);
        lines.push(...availableProducts);
        lines.push('');
      }
    }

    this.cachedSummary =
      lines.length > 0
        ? lines.join('\n').trim()
        : 'No hay productos con stock disponible en este momento.';
    this.cachedAt = now;
    return this.cachedSummary;
  }
}
