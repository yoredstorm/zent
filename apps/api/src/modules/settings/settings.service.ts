import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateStoreDto } from './dto/update-store.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getStore() {
    const store = await this.prisma.storeSettings.findFirst();
    if (!store) return null;
    return this.toStoreResponse(store);
  }

  async updateStore(dto: UpdateStoreDto) {
    const current = await this.prisma.storeSettings.findFirst();
    if (!current) throw new NotFoundException('Tienda no configurada');

    const { phone, ...rest } = dto;
    const data = {
      ...rest,
      ...(phone !== undefined ? { phoneNumber: phone } : {}),
    };

    const updated = await this.prisma.storeSettings.update({
      where: { id: current.id },
      data,
    });
    return this.toStoreResponse(updated);
  }

  private toStoreResponse(store: {
    id: number;
    storeName: string;
    logoUrl: string | null;
    currency: string;
    taxRate: number;
    phoneNumber: string;
    ownerName: string | null;
    whatsappLinked: boolean;
    updatedAt: Date;
  }) {
    const { phoneNumber, ...rest } = store;
    return { ...rest, phone: phoneNumber };
  }
}
