import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CartService } from '../whatsapp-bot/cart.service';
import { CartHoldService } from '../inventory/cart-hold.service';
import { StockReservationService } from '../inventory/stock-reservation.service';
import { CustomersService, normalizePhone } from '../customers/customers.service';
import { OrdersService } from '../orders/orders.service';
import { VendorNotifyService } from '../orders/vendor-notify.service';
import { ChatSessionService } from '../whatsapp-bot/chat-session.service';
import { ChatState } from '@prisma/client';

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
    return {
      ok: true,
      message: `Agregado ${quantity}x ${product.nombre}`,
      cart: this.formatCart(cart),
    };
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

  private formatCart(cart: { items: { productId: string; nombre: string; quantity: number; unitPrice: number }[]; total: number }) {
    return {
      items: cart.items.map((i) => ({
        productId: i.productId,
        nombre: i.nombre,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.quantity * i.unitPrice,
      })),
      total: cart.total,
      itemCount: cart.items.length,
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

    const customerPhone = normalizePhone(data.customerPhone);
    const customer = await this.customers.upsertFromOrder({
      customerName: data.customerName.trim(),
      customerPhone,
      address: data.address.trim(),
      reference: data.reference?.trim(),
    });

    try {
      const order = await this.orders.create({
        customerName: data.customerName.trim(),
        customerPhone,
        address: data.address.trim(),
        reference: data.reference?.trim(),
        customerId: customer.id,
        chatId: ctx.chatId,
        source: 'WHATSAPP',
        items: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costAtSale: item.costAtSale,
        })),
      });

      await this.cart.clearCart(ctx.stateKey);
      await this.cartHold.release(ctx.stateKey);
      await this.chatSession.updateState(ctx.stateKey, ChatState.PEDIDO_CREADO, { cartJson: null });

      return {
        ok: true,
        orderId: order.id,
        shortId: order.id.slice(0, 8),
        total: cart.total,
      };
    } catch (err) {
      const msg = err instanceof BadRequestException ? err.message : 'No se pudo crear el pedido';
      return { error: msg };
    }
  }

  async handoffToHuman(ctx: BotCommerceContext, _reason?: string) {
    await this.chatSession.updateState(ctx.stateKey, ChatState.HANDOFF_HUMANO);
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

    return { ok: true, handoff: true };
  }

  async getCatalogPdf() {
    const pdf = await this.prisma.catalogPdf.findFirst({ where: { isActive: true } });
    if (!pdf) return { available: false };
    return { available: true, url: pdf.url };
  }
}
