import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService } from '../whatsapp-bot/cart.service';
import { CartHoldService } from '../inventory/cart-hold.service';
import { StockReservationService } from '../inventory/stock-reservation.service';
import { CustomersService, normalizePhone } from '../customers/customers.service';
import { OrdersService } from '../orders/orders.service';
import { VendorNotifyService } from '../orders/vendor-notify.service';
import {
  ChatSessionService,
  CheckoutDraft,
} from '../whatsapp-bot/chat-session.service';
import { ChatState } from '@prisma/client';
import type { Cart } from '../whatsapp-bot/cart.types';
import { WorkflowEventsService } from '../workflows/workflow-events.service';

export interface BotCommerceContext {
  stateKey: string;
  chatId: string;
  waSessionId?: string;
  contactPhone: string | null;
}

@Injectable()
export class BotCommerceFacade {
  constructor(
    private prisma: PrismaService,
    private cart: CartService,
    private cartHold: CartHoldService,
    private stock: StockReservationService,
    private customers: CustomersService,
    private orders: OrdersService,
    private vendorNotify: VendorNotifyService,
    private chatSession: ChatSessionService,
    private config: ConfigService,
    private workflowEvents: WorkflowEventsService,
  ) {}

  async listCategories() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { orden: 'asc' },
    });
    const result: { id: string; nombre: string; productCount: number }[] = [];
    for (const cat of categories) {
      const products = await this.prisma.product.findMany({
        where: { categoryId: cat.id, isActive: true },
      });
      let count = 0;
      for (const p of products) {
        const available = await this.stock.getAvailableStock(p.id);
        if (available > 0) count++;
      }
      if (count > 0) result.push({ id: cat.id, nombre: cat.nombre, productCount: count });
    }
    return result;
  }

  async searchProducts(query?: string, categoryId?: string, limit = 10) {
    const q = query?.trim().toLowerCase();
    const products = await this.prisma.product.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: 'insensitive' } },
                { descripcion: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: Math.min(limit, 20),
      orderBy: { nombre: 'asc' },
      include: { category: true },
    });

    const hits: Array<{
      id: string;
      nombre: string;
      salePrice: number;
      category: string;
      availableStock: number;
    }> = [];

    for (const p of products) {
      const availableStock = await this.stock.getAvailableStock(p.id);
      if (availableStock <= 0) continue;
      hits.push({
        id: p.id,
        nombre: p.nombre,
        salePrice: Number(p.salePrice),
        category: p.category.nombre,
        availableStock,
      });
    }
    return hits;
  }

  async getProductDetails(productId: string, ctx: BotCommerceContext) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { category: true, images: { orderBy: { orden: 'asc' }, take: 1 } },
    });
    if (!product || !product.isActive) {
      return { error: 'Producto no encontrado' };
    }
    const availableStock = await this.stock.getAvailableStock(product.id, {
      excludeStateKey: ctx.stateKey,
    });
    await this.chatSession.setPendingProduct(ctx.stateKey, product.id);
    return {
      id: product.id,
      nombre: product.nombre,
      descripcion: product.descripcion,
      salePrice: Number(product.salePrice),
      category: product.category.nombre,
      availableStock,
      imageUrl: product.images[0]?.url ?? null,
    };
  }

  async getCustomerProfile(ctx: BotCommerceContext) {
    const phone = ctx.contactPhone;
    if (!phone) {
      return { registered: false, phone: null, name: null, address: null, reference: null };
    }
    const customer = await this.customers.findByPhone(phone);
    if (!customer) {
      return { registered: false, phone, name: null, address: null, reference: null };
    }
    return {
      registered: true,
      phone: customer.phone,
      name: customer.name,
      address: customer.address,
      reference: customer.reference,
    };
  }

  private async syncCartHold(ctx: BotCommerceContext) {
    const cart = await this.cart.getCart(ctx.stateKey);
    const phone = ctx.contactPhone;
    const existing = phone ? await this.customers.findByPhone(phone) : null;
    await this.cartHold.syncFromCart(ctx.stateKey, cart, {
      chatId: ctx.chatId,
      contactPhone: phone,
      customerName: existing?.name ?? null,
    });
  }

  async addToCart(ctx: BotCommerceContext, productId: string, quantity: number) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      return { error: 'Producto no encontrado' };
    }
    const available = await this.stock.getAvailableStock(product.id, {
      excludeStateKey: ctx.stateKey,
    });
    if (quantity > available) {
      return {
        error:
          available <= 0
            ? `No hay stock de ${product.nombre}`
            : `Solo hay ${available} unidad(es) disponibles`,
      };
    }

    await this.cart.addItem(ctx.stateKey, {
      productId: product.id,
      nombre: product.nombre,
      quantity,
      unitPrice: Number(product.salePrice),
      costAtSale: Number(product.costPrice),
    });
    await this.syncCartHold(ctx);
    const cart = await this.cart.getCart(ctx.stateKey);
    await this.chatSession.clearPendingProduct(ctx.stateKey);
    return {
      ok: true,
      message: `Agregado ${quantity}x ${product.nombre}`,
      cart: this.formatCart(cart),
    };
  }

  async updateCartItem(ctx: BotCommerceContext, productId: string, quantity: number) {
    if (quantity <= 0) {
      return this.removeFromCart(ctx, productId);
    }
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) {
      return { error: 'Producto no encontrado' };
    }
    const available = await this.stock.getAvailableStock(product.id, {
      excludeStateKey: ctx.stateKey,
    });
    if (quantity > available) {
      return { error: `Solo hay ${available} unidad(es) disponibles` };
    }
    await this.cart.updateQuantity(ctx.stateKey, productId, quantity);
    await this.syncCartHold(ctx);
    const cart = await this.cart.getCart(ctx.stateKey);
    return { ok: true, cart: this.formatCart(cart) };
  }

  async viewCart(ctx: BotCommerceContext) {
    const cart = await this.cart.getCart(ctx.stateKey);
    return this.formatCart(cart);
  }

  async removeFromCart(ctx: BotCommerceContext, productId: string) {
    await this.cart.removeItem(ctx.stateKey, productId);
    await this.syncCartHold(ctx);
    const cart = await this.cart.getCart(ctx.stateKey);
    return { ok: true, cart: this.formatCart(cart) };
  }

  private formatCart(cart: Cart) {
    return {
      items: cart.items.map((i) => ({
        productId: i.productId,
        nombre: i.nombre,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.quantity * i.unitPrice,
      })),
      subtotal: cart.subtotal,
      deliveryCost: cart.deliveryCost,
      total: cart.total,
      itemCount: cart.items.length,
    };
  }

  async getCheckoutDraft(ctx: BotCommerceContext) {
    const cart = await this.cart.getCart(ctx.stateKey);
    const draft = await this.chatSession.getCheckoutDraft(ctx.stateKey);
    const profile = await this.getCustomerProfile(ctx);

    const customerName = draft.customerName ?? profile.name ?? '';
    const customerPhone = draft.customerPhone ?? profile.phone ?? ctx.contactPhone ?? '';
    const address = draft.address ?? profile.address ?? '';
    const reference = draft.reference ?? profile.reference ?? '';

    const missing: string[] = [];
    if (!customerName.trim()) missing.push('customerName');
    if (!customerPhone.trim()) missing.push('customerPhone');
    if (!address.trim()) missing.push('address');

    return {
      cart: this.formatCart(cart),
      draft: {
        customerName,
        customerPhone,
        address,
        reference,
        confirmed: draft.confirmed === true,
      },
      missing,
      readyToConfirm: missing.length === 0 && cart.items.length > 0,
    };
  }

  async getPaymentMethods() {
    return {
      methods:
        this.config.get<string>('BOT_AI_PAYMENT_METHODS', '').trim() ||
        'Transferencia, Yape/Plin o pago contra entrega',
      requiresValidation: true,
      note: 'Registra la referencia de pago y espera validación antes de confirmar que el pago fue aprobado.',
    };
  }

  async findCustomerOrders(ctx: BotCommerceContext, limit = 5) {
    const phone = ctx.contactPhone?.replace(/\D/g, '');
    if (!phone || phone.length < 8) {
      return { orders: [], message: 'No pude identificar tu teléfono de WhatsApp.' };
    }

    const rows = await this.prisma.order.findMany({
      where: { customerPhone: { contains: phone.slice(-9) } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 10),
      include: { items: { include: { product: true } } },
    });

    return {
      orders: rows.map((o) => ({
        id: o.id,
        shortId: o.id.slice(0, 8),
        status: o.status,
        total: Number(o.total),
        createdAt: o.createdAt,
        items: o.items.map((i) => ({
          quantity: i.quantity,
          productName: i.product?.nombre ?? 'Producto',
        })),
      })),
    };
  }

  private async findCustomerOrder(ctx: BotCommerceContext, orderId: string) {
    const clean = orderId.trim();
    const phone = ctx.contactPhone?.replace(/\D/g, '');
    const where = {
      AND: [
        clean.length >= 8
          ? { OR: [{ id: clean }, { id: { startsWith: clean } }] }
          : { id: clean },
        phone && phone.length >= 8 ? { customerPhone: { contains: phone.slice(-9) } } : {},
      ],
    };
    return this.prisma.order.findFirst({
      where,
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrderStatus(ctx: BotCommerceContext, orderId: string) {
    const order = await this.findCustomerOrder(ctx, orderId);
    if (!order) {
      return { error: 'No encontré ese pedido para tu número de WhatsApp.' };
    }

    return {
      id: order.id,
      shortId: order.id.slice(0, 8),
      status: order.status,
      total: Number(order.total),
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt,
      items: order.items.map((i) => ({
        quantity: i.quantity,
        productName: i.product?.nombre ?? 'Producto',
      })),
    };
  }

  async submitPaymentReference(
    ctx: BotCommerceContext,
    orderId: string,
    reference: string,
    method?: string,
  ) {
    const order = await this.findCustomerOrder(ctx, orderId);
    if (!order) {
      return { error: 'No encontré ese pedido para tu número de WhatsApp.' };
    }

    const cleanReference = reference.trim();
    if (!cleanReference) return { error: 'La referencia de pago está vacía.' };

    const noteLine = `[Pago IA] ${method ? `${method}: ` : ''}${cleanReference}`;
    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        ...(method?.trim() ? { paymentMethod: method.trim() } : {}),
        notes: [order.notes, noteLine].filter(Boolean).join('\n'),
      },
    });

    await this.workflowEvents.emit('payment.reference_submitted', {
      orderId: updated.id,
      shortId: updated.id.slice(0, 8),
      method: method?.trim() || null,
      reference: cleanReference,
      customerPhone: updated.customerPhone,
    });

    return {
      ok: true,
      orderId: updated.id,
      shortId: updated.id.slice(0, 8),
      status: updated.status,
      message: 'Referencia registrada. Esperaremos validación antes de confirmar el pago.',
    };
  }

  async saveCheckoutField(
    ctx: BotCommerceContext,
    field: keyof CheckoutDraft,
    value: string,
  ) {
    const allowed: Array<keyof CheckoutDraft> = [
      'customerName',
      'customerPhone',
      'address',
      'reference',
    ];
    if (!allowed.includes(field)) {
      return { error: 'Campo no permitido' };
    }
    const draft = await this.chatSession.saveCheckoutDraft(ctx.stateKey, {
      [field]: value.trim(),
      confirmed: false,
    });
    await this.chatSession.setAiPhase(ctx.stateKey, 'checkout');
    return { ok: true, draft };
  }

  async confirmOrder(ctx: BotCommerceContext) {
    const checkout = await this.getCheckoutDraft(ctx);
    if (checkout.cart.itemCount === 0) {
      return { error: 'El carrito está vacío' };
    }
    if (!checkout.readyToConfirm) {
      return { error: 'Faltan datos de entrega', missing: checkout.missing };
    }

    await this.chatSession.saveCheckoutDraft(ctx.stateKey, { confirmed: true });
    await this.chatSession.setAiPhase(ctx.stateKey, 'confirming');

    return {
      ok: true,
      summary: {
        items: checkout.cart.items,
        subtotal: checkout.cart.subtotal,
        deliveryCost: checkout.cart.deliveryCost,
        total: checkout.cart.total,
        customerName: checkout.draft.customerName,
        customerPhone: checkout.draft.customerPhone,
        address: checkout.draft.address,
        reference: checkout.draft.reference,
      },
      message: 'Pedido listo para enviar. Usa submit_order para crear el pedido.',
    };
  }

  async submitOrder(
    ctx: BotCommerceContext,
    data: { customerName: string; customerPhone: string; address: string; reference?: string },
  ) {
    const cart = await this.cart.getCart(ctx.stateKey);
    if (cart.items.length === 0) {
      return { error: 'El carrito está vacío' };
    }

    const draft = await this.chatSession.getCheckoutDraft(ctx.stateKey);
    const customerName = data.customerName.trim() || draft.customerName?.trim() || '';
    const customerPhone = normalizePhone(data.customerPhone || draft.customerPhone || ctx.contactPhone || '');
    const address = data.address.trim() || draft.address?.trim() || '';
    const reference = data.reference?.trim() || draft.reference?.trim();

    if (!customerName || !customerPhone || !address) {
      return { error: 'Faltan datos de entrega (nombre, teléfono, dirección)' };
    }

    const customer = await this.customers.upsertFromOrder({
      customerName,
      customerPhone,
      address,
      reference,
    });

    try {
      const order = await this.orders.create({
        customerName,
        customerPhone,
        address,
        reference,
        customerId: customer.id,
        chatId: ctx.chatId,
        source: 'WHATSAPP',
        deliveryCost: cart.deliveryCost,
        items: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costAtSale: item.costAtSale,
        })),
      });

      await this.cart.clearCart(ctx.stateKey);
      await this.cartHold.release(ctx.stateKey);
      await this.chatSession.clearCheckoutDraft(ctx.stateKey);
      await this.chatSession.setAiPhase(ctx.stateKey, 'browsing');
      await this.chatSession.updateState(ctx.stateKey, ChatState.PEDIDO_CREADO, { cartJson: null });

      return {
        ok: true,
        orderId: order.id,
        shortId: order.id.slice(0, 8),
        subtotal: cart.subtotal,
        deliveryCost: cart.deliveryCost,
        total: cart.total,
      };
    } catch (err) {
      const msg = err instanceof BadRequestException ? err.message : 'No se pudo crear el pedido';
      return { error: msg };
    }
  }

  async handoffToHuman(ctx: BotCommerceContext, _reason?: string) {
    await this.chatSession.updateState(ctx.stateKey, ChatState.HANDOFF_HUMANO);
    await this.chatSession.setAiPhase(ctx.stateKey, 'handoff');
    const phone = ctx.contactPhone;
    const existing = phone ? await this.customers.findByPhone(phone) : null;

    if (existing) {
      await this.chatSession.updateCustomerData(ctx.stateKey, {
        customerName: existing.name,
        customerPhone: existing.phone,
      });
    } else if (phone) {
      await this.chatSession.updateCustomerData(ctx.stateKey, { customerPhone: phone });
    }

    void this.vendorNotify.notifyHandoffRequest({
      chatId: ctx.chatId,
      customerName: existing?.name ?? undefined,
      customerPhone: existing?.phone ?? phone ?? undefined,
      waSessionId: ctx.waSessionId,
    });
    void this.workflowEvents.emit('handoff.requested', {
      chatId: ctx.chatId,
      customerName: existing?.name ?? null,
      customerPhone: existing?.phone ?? phone ?? null,
      waSessionId: ctx.waSessionId ?? null,
    });

    return { ok: true, handoff: true };
  }

  async getCatalogPdf() {
    const pdf = await this.prisma.catalogPdf.findFirst({ where: { isActive: true } });
    if (!pdf) return { available: false };
    return { available: true, url: pdf.url };
  }
}
