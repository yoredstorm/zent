import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatState } from '@prisma/client';

@Injectable()
export class ChatSessionService {
  constructor(private prisma: PrismaService) {}

  async getOrCreate(chatId: string) {
    let session = await this.prisma.chatSession.findUnique({ where: { chatId } });
    if (!session) {
      session = await this.prisma.chatSession.create({
        data: { chatId, state: ChatState.MENU_PRINCIPAL },
      });
    } else {
      session = await this.prisma.chatSession.update({
        where: { chatId },
        data: { lastInteractionAt: new Date() },
      });
    }
    return session;
  }

  async updateState(chatId: string, state: ChatState, extra?: Record<string, any>) {
    return this.prisma.chatSession.update({
      where: { chatId },
      data: { state, ...extra },
    });
  }

  async updateCustomerData(chatId: string, data: { customerName?: string; customerPhone?: string }) {
    return this.prisma.chatSession.update({
      where: { chatId },
      data,
    });
  }
}