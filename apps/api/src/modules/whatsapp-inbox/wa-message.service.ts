import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { normalizePhone } from '../customers/customers.service';
import { OpenwaService } from '../openwa/openwa.service';
import { extractPhoneFromWaId } from '../whatsapp-bot/wa-contact.util';
import { ChatState } from '@prisma/client';
import {
  buildConversationId,
  parseWaConversationId,
  shortWaChatLabel,
} from './wa-conversation.util';
import { messagePreview, parseOpenWaMessage } from './wa-message-mapper.util';

export type WaMessageSource = 'customer' | 'bot' | 'agent';

export interface WaConversationSummary {
  chatId: string;
  waChatId: string;
  contactPhone: string | null;
  contactDisplayName: string | null;
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

export interface WaMediaFields {
  messageType?: string;
  mediaUrl?: string | null;
  mimeType?: string | null;
  caption?: string | null;
  waMessageId?: string | null;
}

@Injectable()
export class WaMessageService {
  private readonly logger = new Logger(WaMessageService.name);
  private readonly lastSyncAt = new Map<string, number>();
  private static readonly SYNC_THROTTLE_MS = 30_000;

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    @Inject(forwardRef(() => OpenwaService))
    private openwa: OpenwaService,
  ) {}

  private canonicalWaChatId(chatId: string): string {
    return parseWaConversationId(chatId).waChatId;
  }

  private conversationId(waChatId: string, waSessionId?: string | null): string {
    return buildConversationId(waChatId, waSessionId);
  }

  private messageWhereForConversation(convId: string) {
    const { waSessionId, waChatId } = parseWaConversationId(convId);
    const or: Array<Record<string, unknown>> = [
      { chatId: convId },
      { chatId: waChatId },
    ];
    if (waSessionId) {
      or.push({ chatId: waChatId, waSessionId });
    }
    return { OR: or };
  }

  async existsByWaMessageId(waMessageId: string): Promise<boolean> {
    const row = await this.prisma.waMessage.findUnique({
      where: { waMessageId },
      select: { id: true },
    });
    return !!row;
  }

  private async upsertWaContactName(
    waChatId: string,
    waSessionId: string | null | undefined,
    contactName?: string,
  ) {
    const name = contactName?.trim();
    if (!name) return;
    const stateKey = this.conversationId(waChatId, waSessionId);
    await this.prisma.chatSession.upsert({
      where: { chatId: stateKey },
      create: {
        chatId: stateKey,
        waContactName: name,
        state: ChatState.MENU_PRINCIPAL,
      },
      update: { waContactName: name },
    });
  }

  async logInbound(
    data: {
      chatId: string;
      body: string;
      fromMe?: boolean;
      waSessionId?: string;
      senderPhone?: string;
      contactName?: string;
    } & WaMediaFields,
  ): Promise<void> {
    const waChatId = this.canonicalWaChatId(data.chatId);
    const contactPhone = data.senderPhone
      ? normalizePhone(data.senderPhone)
      : extractPhoneFromWaId(waChatId);

    if (data.waMessageId) {
      const exists = await this.existsByWaMessageId(data.waMessageId);
      if (exists) return;
    }

    const msg = await this.prisma.waMessage.create({
      data: {
        chatId: waChatId,
        body: data.body,
        direction: 'IN',
        source: data.fromMe ? 'bot' : 'customer',
        fromMe: data.fromMe ?? false,
        waSessionId: data.waSessionId,
        contactPhone,
        messageType: data.messageType ?? 'text',
        mediaUrl: data.mediaUrl ?? undefined,
        mimeType: data.mimeType ?? undefined,
        caption: data.caption ?? undefined,
        waMessageId: data.waMessageId ?? undefined,
      },
    });

    await this.upsertWaContactName(waChatId, data.waSessionId, data.contactName);

    const convId = this.conversationId(waChatId, data.waSessionId);
    this.realtime.publish('message.received', {
      chatId: convId,
      messageId: msg.id,
      messageType: msg.messageType,
      fromMe: data.fromMe ?? false,
    });
  }

  async logOutbound(
    data: {
      chatId: string;
      body: string;
      source: WaMessageSource;
      waSessionId?: string;
      contactPhone?: string | null;
    } & WaMediaFields,
  ): Promise<void> {
    const waChatId = this.canonicalWaChatId(data.chatId);

    if (data.waMessageId) {
      const exists = await this.existsByWaMessageId(data.waMessageId);
      if (exists) return;
    }

    const msg = await this.prisma.waMessage.create({
      data: {
        chatId: waChatId,
        body: data.body,
        direction: 'OUT',
        source: data.source,
        fromMe: true,
        waSessionId: data.waSessionId,
        contactPhone: data.contactPhone ?? extractPhoneFromWaId(waChatId),
        messageType: data.messageType ?? 'text',
        mediaUrl: data.mediaUrl ?? undefined,
        mimeType: data.mimeType ?? undefined,
        caption: data.caption ?? undefined,
        waMessageId: data.waMessageId ?? undefined,
      },
    });

    const convId = this.conversationId(waChatId, data.waSessionId);
    this.realtime.publish('message.sent', {
      chatId: convId,
      messageId: msg.id,
      messageType: msg.messageType,
      source: data.source,
    });
  }

  async syncFromOpenWA(convId: string, opts?: { limit?: number; force?: boolean }) {
    const decoded = decodeURIComponent(convId);
    const limit = opts?.limit ?? 80;
    const now = Date.now();
    const last = this.lastSyncAt.get(decoded) ?? 0;
    if (!opts?.force && now - last < WaMessageService.SYNC_THROTTLE_MS) {
      return { synced: 0, skipped: true };
    }

    const { waSessionId, waChatId } = parseWaConversationId(decoded);
    let sessionId = waSessionId;
    if (!sessionId) {
      try {
        sessionId = await this.openwa.resolveSessionId();
      } catch (err) {
        this.logger.warn(`syncFromOpenWA: no session for ${decoded}: ${err}`);
        return { synced: 0, skipped: true };
      }
    }

    let remoteMessages: Awaited<ReturnType<OpenwaService['getChatMessages']>>;
    try {
      remoteMessages = await this.openwa.getChatMessages(sessionId, waChatId, { limit });
    } catch (err) {
      this.logger.warn(`syncFromOpenWA failed for ${waChatId}: ${err}`);
      return { synced: 0, error: true };
    }

    let synced = 0;
    for (const raw of remoteMessages) {
      const parsed = parseOpenWaMessage(raw);
      if (parsed.waMessageId) {
        const exists = await this.existsByWaMessageId(parsed.waMessageId);
        if (exists) continue;
      }

      const base = {
        chatId: waChatId,
        body: parsed.body,
        waSessionId: sessionId,
        messageType: parsed.messageType,
        mediaUrl: parsed.mediaUrl,
        mimeType: parsed.mimeType,
        caption: parsed.caption,
        waMessageId: parsed.waMessageId,
      };

      if (parsed.fromMe) {
        await this.prisma.waMessage.create({
          data: {
            ...base,
            direction: 'OUT',
            source: 'bot',
            fromMe: true,
            createdAt: parsed.createdAt,
          },
        });
      } else {
        await this.prisma.waMessage.create({
          data: {
            ...base,
            direction: 'IN',
            source: 'customer',
            fromMe: false,
            contactPhone: extractPhoneFromWaId(waChatId),
            createdAt: parsed.createdAt,
          },
        });
      }
      synced += 1;
    }

    this.lastSyncAt.set(decoded, now);
    return { synced, skipped: false };
  }

  private resolveDisplayName(
    session: { waContactName?: string | null; customerName?: string | null } | null | undefined,
    customerName: string | null,
    phone: string | null,
    waChatId: string,
  ): string {
    return (
      session?.waContactName?.trim() ||
      session?.customerName?.trim() ||
      customerName?.trim() ||
      (phone ? (phone.startsWith('+') ? phone : `+${phone}`) : null) ||
      shortWaChatLabel(waChatId)
    );
  }

  async listConversations(filter?: 'handoff' | 'orders'): Promise<WaConversationSummary[]> {
    const recentMessages = await this.prisma.waMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 800,
    });

    const lastByConv = new Map<string, (typeof recentMessages)[0]>();
    for (const m of recentMessages) {
      const convId = this.conversationId(m.chatId, m.waSessionId);
      if (!lastByConv.has(convId)) lastByConv.set(convId, m);
    }

    const sessions = await this.prisma.chatSession.findMany({
      orderBy: { lastInteractionAt: 'desc' },
      take: 200,
    });

    const sessionMap = new Map(sessions.map((s) => [s.chatId, s]));
    const convIds = new Set<string>([...lastByConv.keys(), ...sessions.map((s) => s.chatId)]);

    const summaries: WaConversationSummary[] = [];
    let enrichBudget = 8;

    for (const convId of convIds) {
      const { waSessionId, waChatId } = parseWaConversationId(convId);
      const last = lastByConv.get(convId);
      const session = sessionMap.get(convId);

      let phone =
        session?.customerPhone ??
        last?.contactPhone ??
        extractPhoneFromWaId(waChatId);

      let customerName: string | null = null;
      if (!session?.waContactName && phone) {
        const customer = await this.prisma.customer.findUnique({
          where: { phone: normalizePhone(phone) },
        });
        customerName = customer?.name ?? null;
      }

      let waContactName = session?.waContactName ?? null;
      if (!waContactName && enrichBudget > 0 && waSessionId) {
        enrichBudget -= 1;
        try {
          const resolved = await this.openwa.resolveContactName(waChatId, waSessionId);
          if (resolved) {
            waContactName = resolved;
            await this.upsertWaContactName(waChatId, waSessionId, resolved);
          }
        } catch {
          /* best-effort */
        }
      }

      if (!phone && waSessionId && waChatId.includes('@lid') && enrichBudget > 0) {
        enrichBudget -= 1;
        try {
          const resolvedPhone = await this.openwa.resolveContactPhone(waChatId, waSessionId);
          if (resolvedPhone) phone = normalizePhone(resolvedPhone);
        } catch {
          /* best-effort */
        }
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

      const displaySession = session
        ? { ...session, waContactName: waContactName ?? session.waContactName }
        : waContactName
          ? { waContactName, customerName: null }
          : null;

      summaries.push({
        chatId: convId,
        waChatId,
        contactPhone: phone,
        contactDisplayName: this.resolveDisplayName(displaySession, customerName, phone, waChatId),
        customerName: session?.customerName ?? customerName,
        lastMessage: last
          ? messagePreview(last.body, last.messageType, last.caption)
          : '(sin mensajes)',
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

  async listMessages(convId: string, limit = 50, before?: string, sync = true) {
    const decoded = decodeURIComponent(convId);
    if (sync) {
      await this.syncFromOpenWA(decoded, { limit: Math.max(limit, 80) });
    }
    return this.prisma.waMessage.findMany({
      where: {
        ...this.messageWhereForConversation(decoded),
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
  }

  async getConversationMeta(convId: string) {
    const decoded = decodeURIComponent(convId);
    const { waSessionId, waChatId } = parseWaConversationId(decoded);

    let session = await this.prisma.chatSession.findUnique({
      where: { chatId: decoded },
    });
    if (!session && waSessionId) {
      session = await this.prisma.chatSession.findUnique({
        where: { chatId: buildConversationId(waChatId, waSessionId) },
      });
    }

    let phone = session?.customerPhone ?? extractPhoneFromWaId(waChatId);
    if (!phone && waSessionId && waChatId.includes('@lid')) {
      const resolved = await this.openwa.resolveContactPhone(waChatId, waSessionId);
      if (resolved) phone = normalizePhone(resolved);
    }

    if (!session?.waContactName && waSessionId) {
      const resolvedName = await this.openwa.resolveContactName(waChatId, waSessionId);
      if (resolvedName) {
        await this.upsertWaContactName(waChatId, waSessionId, resolvedName);
        session = await this.prisma.chatSession.findUnique({
          where: { chatId: buildConversationId(waChatId, waSessionId) },
        });
      }
    }

    const customer = phone
      ? await this.prisma.customer.findUnique({
          where: { phone: normalizePhone(phone) },
        })
      : null;

    const openOrder = phone
      ? await this.prisma.order.findFirst({
          where: {
            OR: [
              { chatId: waChatId },
              { chatId: decoded },
              { customerPhone: { contains: phone.slice(-9) } },
            ],
            status: { in: ['NUEVO', 'EN_GESTION', 'CONFIRMADO', 'EN_DELIVERY'] },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    const contactDisplayName = this.resolveDisplayName(
      session,
      customer?.name ?? null,
      phone,
      waChatId,
    );

    return {
      chatId: decoded,
      waChatId,
      contactDisplayName,
      session,
      customer,
      openOrder,
    };
  }

  resolveSendTarget(convId: string) {
    const decoded = decodeURIComponent(convId);
    const { waSessionId, waChatId } = parseWaConversationId(decoded);
    return { waChatId, waSessionId: waSessionId ?? undefined };
  }
}
