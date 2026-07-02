import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatState } from '@prisma/client';

export type AiPhase = 'browsing' | 'checkout' | 'confirming' | 'handoff';

export interface CheckoutDraft {
  customerName?: string;
  customerPhone?: string;
  address?: string;
  reference?: string;
  confirmed?: boolean;
}

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
    if (context === null) {
      const session = await this.prisma.chatSession.findUnique({ where: { chatId } });
      const existing = this.parseContextJson(session?.contextJson ?? null);
      const aiMessages = existing.aiMessages;
      const next = aiMessages ? { aiMessages } : null;
      return this.prisma.chatSession.update({
        where: { chatId },
        data: { contextJson: next ? JSON.stringify(next) : null },
      });
    }

    const session = await this.prisma.chatSession.findUnique({ where: { chatId } });
    const existing = this.parseContextJson(session?.contextJson ?? null);
    const merged = { ...existing, ...context };
    return this.prisma.chatSession.update({
      where: { chatId },
      data: { contextJson: JSON.stringify(merged) },
    });
  }

  async getContext(chatId: string): Promise<Record<string, any>> {
    const session = await this.prisma.chatSession.findUnique({ where: { chatId } });
    return this.parseContextJson(session?.contextJson ?? null) as Record<string, any>;
  }

  async updateCustomerData(chatId: string, data: { customerName?: string; customerPhone?: string }) {
    return this.prisma.chatSession.update({
      where: { chatId },
      data,
    });
  }

  private parseContextJson(raw: string | null): Record<string, unknown> {
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  async getAiMessages(chatId: string): Promise<unknown[]> {
    const session = await this.prisma.chatSession.findUnique({ where: { chatId } });
    const ctx = this.parseContextJson(session?.contextJson ?? null);
    const messages = ctx.aiMessages;
    return Array.isArray(messages) ? messages : [];
  }

  async setAiMessages(chatId: string, messages: unknown[]): Promise<void> {
    const session = await this.prisma.chatSession.findUnique({ where: { chatId } });
    const ctx = this.parseContextJson(session?.contextJson ?? null);
    ctx.aiMessages = messages;
    await this.prisma.chatSession.update({
      where: { chatId },
      data: { contextJson: JSON.stringify(ctx) },
    });
  }

  async getAiPhase(chatId: string): Promise<AiPhase> {
    const ctx = await this.getContext(chatId);
    const phase = ctx.aiPhase;
    if (phase === 'checkout' || phase === 'confirming' || phase === 'handoff') return phase;
    return 'browsing';
  }

  async setAiPhase(chatId: string, phase: AiPhase): Promise<void> {
    await this.updateContext(chatId, { aiPhase: phase });
  }

  async getCheckoutDraft(chatId: string): Promise<CheckoutDraft> {
    const ctx = await this.getContext(chatId);
    const draft = ctx.checkoutDraft;
    if (!draft || typeof draft !== 'object') return {};
    return draft as CheckoutDraft;
  }

  async saveCheckoutDraft(chatId: string, patch: Partial<CheckoutDraft>): Promise<CheckoutDraft> {
    const current = await this.getCheckoutDraft(chatId);
    const merged = { ...current, ...patch };
    await this.updateContext(chatId, { checkoutDraft: merged });
    return merged;
  }

  async clearCheckoutDraft(chatId: string): Promise<void> {
    const ctx = await this.getContext(chatId);
    delete ctx.checkoutDraft;
    await this.prisma.chatSession.update({
      where: { chatId },
      data: { contextJson: Object.keys(ctx).length ? JSON.stringify(ctx) : null },
    });
  }
}