import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { normalizePhone } from '../customers/customers.service';
import { ChatState } from '@prisma/client';

export type WaMessageSource = 'customer' | 'bot' | 'agent';

export interface WaConversationSummary {
  chatId: string;
  contactPhone: string | null;
  customerName: string | null;
  lastMessage: string;
  lastMessageAt: string;
  lastDirection: string;
  lastSource: string;
  chatState: ChatState | null;
  needsHandoff: boolean;
  hasNewOrder: boolean;
  unreadHint: boolean;
}

@Injectable()
export class WaMessageService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
  ) {}

  async logInbound(data: {
    chatId: string;
    body: string;
    fromMe?: boolean;
    waSessionId?: string;
    senderPhone?: string;
  }): Promise<void> {
    const contactPhone = data.senderPhone
      ? normalizePhone(data.senderPhone)
      : this.phoneFromChatId(data.chatId);

    const msg = await this.prisma.waMessage.create({
      data: {
        chatId: data.chatId,
        body: data.body,
        direction: 'IN',
        source: data.fromMe ? 'bot' : 'customer',
        fromMe: data.fromMe ?? false,
        waSessionId: data.waSessionId,
        contactPhone,
      },
    });

    this.realtime.publish('message.received', {
      chatId: data.chatId,
      messageId: msg.id,
      fromMe: data.fromMe ?? false,
    });
  }

  async logOutbound(data: {
    chatId: string;
    body: string;
    source: WaMessageSource;
    waSessionId?: string;
    contactPhone?: string | null;
  }): Promise<void> {
    const msg = await this.prisma.waMessage.create({
      data: {
        chatId: data.chatId,
        body: data.body,
        direction: 'OUT',
        source: data.source,
        fromMe: true,
        waSessionId: data.waSessionId,
        contactPhone: data.contactPhone ?? this.phoneFromChatId(data.chatId),
      },
    });

    this.realtime.publish('message.sent', {
      chatId: data.chatId,
      messageId: msg.id,
      source: data.source,
    });
  }

  private phoneFromChatId(chatId: string): string | null {
    const match = chatId.match(/^(\d+)@/);
    return match ? match[1] : null;
  }

  async listConversations(filter?: 'handoff' | 'orders'): Promise<WaConversationSummary[]> {
    const recentMessages = await this.prisma.waMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 800,
    });

    const lastByChat = new Map<string, (typeof recentMessages)[0]>();
    for (const m of recentMessages) {
      if (!lastByChat.has(m.chatId)) lastByChat.set(m.chatId, m);
    }

    const sessions = await this.prisma.chatSession.findMany({
      orderBy: { lastInteractionAt: 'desc' },
      take: 200,
    });

    const chatIds = new Set<string>([
      ...lastByChat.keys(),
      ...sessions.map((s) => s.chatId),
    ]);

    const sessionMap = new Map(sessions.map((s) => [s.chatId, s]));

    const summaries: WaConversationSummary[] = [];

    for (const chatId of chatIds) {
      const last = lastByChat.get(chatId);
      const session = sessionMap.get(chatId);
      const phone =
        session?.customerPhone ??
        last?.contactPhone ??
        this.phoneFromChatId(chatId);

      let customerName = session?.customerName ?? null;
      if (!customerName && phone) {
        const customer = await this.prisma.customer.findUnique({
          where: { phone: normalizePhone(phone) },
        });
        customerName = customer?.name ?? null;
      }

      let hasNewOrder = false;
      if (phone) {
        const recentOrder = await this.prisma.order.findFirst({
          where: {
            customerPhone: { contains: phone.slice(-9) },
            status: 'NUEVO',
            createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
          },
          orderBy: { createdAt: 'desc' },
        });
        hasNewOrder = !!recentOrder;
      }

      const chatState = session?.state ?? null;
      const needsHandoff = chatState === 'HANDOFF_HUMANO';

      if (filter === 'handoff' && !needsHandoff) continue;
      if (filter === 'orders' && !hasNewOrder) continue;

      summaries.push({
        chatId,
        contactPhone: phone,
        customerName,
        lastMessage: last?.body ?? '(sin mensajes)',
        lastMessageAt: (last?.createdAt ?? session?.lastInteractionAt ?? new Date()).toISOString(),
        lastDirection: last?.direction ?? 'IN',
        lastSource: last?.source ?? 'customer',
        chatState,
        needsHandoff,
        hasNewOrder,
        unreadHint: last?.direction === 'IN' && last?.source === 'customer',
      });
    }

    summaries.sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    );

    return summaries.slice(0, 100);
  }

  async listMessages(chatId: string, limit = 50, before?: string) {
    const decoded = decodeURIComponent(chatId);
    return this.prisma.waMessage.findMany({
      where: {
        chatId: decoded,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  async getConversationMeta(chatId: string) {
    const decoded = decodeURIComponent(chatId);
    const session = await this.prisma.chatSession.findUnique({
      where: { chatId: decoded },
    });
    const phone =
      session?.customerPhone ?? this.phoneFromChatId(decoded);
    const customer = phone
      ? await this.prisma.customer.findUnique({
          where: { phone: normalizePhone(phone) },
        })
      : null;
    const openOrder = phone
      ? await this.prisma.order.findFirst({
          where: {
            OR: [
              { chatId: decoded },
              { customerPhone: { contains: phone.slice(-9) } },
            ],
            status: { in: ['NUEVO', 'EN_GESTION', 'CONFIRMADO', 'EN_DELIVERY'] },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    return {
      chatId: decoded,
      session,
      customer,
      openOrder,
    };
  }
}
