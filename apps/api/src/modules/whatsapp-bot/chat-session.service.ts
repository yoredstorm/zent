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

  /** Lee sesión sin actualizar lastInteractionAt (para detectar inactividad). */
  async peek(chatId: string) {
    return this.prisma.chatSession.findUnique({ where: { chatId } });
  }

  async updateState(chatId: string, state: ChatState, extra?: Record<string, any>) {
    return this.prisma.chatSession.update({
      where: { chatId },
      data: { state, ...extra },
    });
  }

  async updateContext(chatId: string, context: Record<string, any> | null) {
    return this.prisma.chatSession.update({
      where: { chatId },
      data: { contextJson: context ? JSON.stringify(context) : null },
    });
  }

  async getContext(chatId: string): Promise<Record<string, any>> {
    const session = await this.prisma.chatSession.findUnique({ where: { chatId } });
    if (!session?.contextJson) return {};
    try {
      return JSON.parse(session.contextJson);
    } catch {
      return {};
    }
  }

  async updateCustomerData(chatId: string, data: { customerName?: string; customerPhone?: string }) {
    return this.prisma.chatSession.update({
      where: { chatId },
      data,
    });
  }
}