import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService } from '../whatsapp-bot/cart.service';
import { ChatSessionService } from '../whatsapp-bot/chat-session.service';
import { CustomersService, normalizePhone } from '../customers/customers.service';
import { VendorNotifyService } from '../orders/vendor-notify.service';
import { parseWaConversationId } from '../whatsapp-inbox/wa-conversation.util';
import type { N8nFlowContext, N8nFlowPhase } from './n8n-flow.types';
import { isCheckoutPhase, isGreetingLikeMessage } from './n8n-message-intent.util';

@Injectable()
export class N8nSessionToolsService {
  constructor(
    private chatSession: ChatSessionService,
    private customers: CustomersService,
    private cart: CartService,
    private config: ConfigService,
    private prisma: PrismaService,
    private vendorNotify: VendorNotifyService,
  ) {}

  async bootstrap(input: {
    chatId: string;
    stateKey: string;
    contactPhone?: string | null;
    message?: string;
  }) {
    const customer = input.contactPhone
      ? await this.customers.findByPhone(input.contactPhone)
      : null;

    let totalOrders = 0;
    if (customer) {
      totalOrders = await this.prisma.order.count({
        where: { customerId: customer.id, status: { not: 'CANCELADO' } },
      });
    }

    const ctx = await this.chatSession.getContext(input.chatId);
    const session = await this.chatSession.peek(input.chatId);
    let flow = (ctx.n8nFlow ?? { phase: 'greeting' }) as N8nFlowContext;

    // Saludo reinicia flujo atascado (ej. browse_categories de pruebas anteriores)
    if (input.message && isGreetingLikeMessage(input.message) && !isCheckoutPhase(flow.phase)) {
      flow = { phase: 'greeting', lastCopyKeys: flow.lastCopyKeys };
    }

    const cartData = await this.cart.getCart(input.stateKey);
    const cartTtlMinutes = Math.round(this.cart.getTtlSeconds() / 60);
    const storeSettings = await this.prisma.storeSettings.findFirst();
    const storeName =
      storeSettings?.storeName?.trim() ||
      this.config.get<string>('STORE_NAME', 'Zent').trim() ||
      'Zent';

    return {
      customer: customer
        ? {
            found: true,
            id: customer.id,
            name: customer.name,
            address: customer.address,
            reference: customer.reference,
            totalOrders,
            isReturning: totalOrders > 1,
          }
        : { found: false as const },
      flow,
      cart: cartData,
      cartTtlMinutes,
      localHour: this.getLocalHour(),
      storeTimezone: this.getStoreTimezone(),
      storeName,
      botPaused: session?.state === ChatState.HANDOFF_HUMANO,
    };
  }

  async patchFlow(chatId: string, patch: Partial<N8nFlowContext>) {
    const ctx = await this.chatSession.getContext(chatId);
    const existing = (ctx.n8nFlow ?? { phase: 'greeting' }) as N8nFlowContext;
    const merged = { ...existing, ...patch };
    await this.chatSession.updateContext(chatId, { n8nFlow: merged });
    return merged;
  }

  async handoff(
    chatId: string,
    meta?: { contactPhone?: string | null; customerName?: string | null; waSessionId?: string },
  ) {
    await this.chatSession.updateState(chatId, ChatState.HANDOFF_HUMANO);

    const phone = meta?.contactPhone?.replace(/\D/g, '') ?? '';
    const existing = phone ? await this.customers.findByPhone(phone) : null;

    if (existing) {
      await this.chatSession.updateCustomerData(chatId, {
        customerName: existing.name,
        customerPhone: existing.phone,
      });
    } else if (phone) {
      await this.chatSession.updateCustomerData(chatId, { customerPhone: phone });
    }

    const { waChatId } = parseWaConversationId(chatId);
    void this.vendorNotify.notifyHandoffRequest({
      chatId: waChatId,
      customerName: existing?.name ?? meta?.customerName ?? undefined,
      customerPhone: existing?.phone ?? phone ?? undefined,
      waSessionId: meta?.waSessionId ?? parseWaConversationId(chatId).waSessionId ?? undefined,
    });

    return { ok: true, botPaused: true };
  }

  async resumeBot(chatId: string) {
    await this.chatSession.updateState(chatId, ChatState.MENU_PRINCIPAL);
    await this.patchFlow(chatId, { phase: 'greeting' as N8nFlowPhase });
    return { ok: true, botPaused: false };
  }

  private getStoreTimezone(): string {
    return this.config.get<string>('STORE_TIMEZONE', 'America/Lima').trim() || 'America/Lima';
  }

  private getLocalHour(): number {
    const tz = this.getStoreTimezone();
    const hourPart = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: tz,
    }).formatToParts(new Date()).find((p) => p.type === 'hour');
    const hour = Number(hourPart?.value);
    return Number.isFinite(hour) ? hour : new Date().getHours();
  }

  async lookupCustomer(phone: string) {
    const normalized = normalizePhone(phone);
    if (normalized.length < 8) throw new BadRequestException('phone is required');

    const customer = await this.customers.findByPhone(normalized);
    if (!customer) {
      return { found: false as const };
    }

    const totalOrders = await this.prisma.order.count({
      where: { customerId: customer.id, status: { not: 'CANCELADO' } },
    });

    return {
      found: true as const,
      id: customer.id,
      name: customer.name,
      address: customer.address,
      reference: customer.reference,
      totalOrders,
      isReturning: totalOrders > 1,
    };
  }

  async findActiveOrderByPhone(customerPhone: string) {
    const phone = normalizePhone(customerPhone);
    if (phone.length < 8) throw new BadRequestException('customerPhone is required');

    const order = await this.prisma.order.findFirst({
      where: {
        customerPhone: { contains: phone.slice(-9) },
        status: { notIn: ['COMPLETADO', 'CANCELADO'] },
      },
      orderBy: { createdAt: 'desc' },
      include: { items: { include: { product: true } } },
    });

    if (!order) {
      return { found: false as const };
    }

    return {
      found: true as const,
      order: {
        id: order.id,
        shortId: order.id.slice(0, 8),
        status: order.status,
        total: Number(order.total),
        createdAt: order.createdAt,
        items: order.items.map((item) => ({
          productName: item.product?.nombre ?? 'Producto',
          quantity: item.quantity,
        })),
      },
    };
  }
}
