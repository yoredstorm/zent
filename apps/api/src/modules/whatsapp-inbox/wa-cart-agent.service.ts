import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CartHoldService } from '../inventory/cart-hold.service';
import { StockReservationService } from '../inventory/stock-reservation.service';
import { OpenwaService } from '../openwa/openwa.service';
import { CartService } from '../whatsapp-bot/cart.service';
import type { CartItem } from '../whatsapp-bot/cart.types';
import { WaMessageService } from './wa-message.service';

@Injectable()
export class WaCartAgentService {
  constructor(
    private cart: CartService,
    private cartHold: CartHoldService,
    private openwa: OpenwaService,
    private waMessages: WaMessageService,
    private stock: StockReservationService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private async resolveStateKey(convId: string): Promise<string> {
    const decoded = decodeURIComponent(convId);
    const meta = await this.waMessages.getConversationMeta(decoded);
    if (meta.activeCart?.stateKey) return meta.activeCart.stateKey;
    return decoded;
  }

  private storeName(): string {
    return this.config.get<string>('STORE_NAME', 'Zent').trim() || 'Zent';
  }

  private formatCartLines(
    items: { nombre: string; quantity: number; unitPrice: number }[],
    total: number,
  ): string {
    const lines = items.map(
      (i) => `• ${i.quantity}x ${i.nombre} — S/ ${(i.quantity * i.unitPrice).toFixed(2)}`,
    );
    lines.push(`\n*Total: S/ ${Number(total).toFixed(2)}*`);
    return lines.join('\n');
  }

  async releaseCart(convId: string, opts?: { notify?: boolean; note?: string }) {
    const decoded = decodeURIComponent(convId);
    const stateKey = await this.resolveStateKey(decoded);
    const meta = await this.waMessages.getConversationMeta(decoded);
    if (!meta.activeCart) {
      throw new BadRequestException('No hay carrito activo en esta conversación');
    }

    await this.cart.clearCart(stateKey);
    await this.cartHold.release(stateKey);

    const notify = opts?.notify !== false;
    if (notify) {
      const { waChatId, waSessionId } = this.waMessages.resolveSendTarget(decoded);
      const name =
        meta.session?.customerName ?? meta.customer?.name ?? meta.activeCart.customerName ?? null;
      const saludo = name?.trim() ? `Hola *${name.trim()}*, ` : 'Hola, ';
      let text =
        `${saludo}desde *${this.storeName()}* liberamos los productos que tenías reservados en tu carrito.\n\n` +
        `El stock ya está disponible para otros clientes. Si quieres comprar de nuevo, escribe *catálogo*.`;
      if (opts?.note?.trim()) {
        text += `\n\n_${opts.note.trim()}_`;
      }
      await this.openwa.sendText({
        chatId: waChatId,
        sessionId: waSessionId,
        text,
        source: 'agent',
      });
    }

    return { ok: true, released: true };
  }

  async updateCart(
    convId: string,
    items: { productId: string; quantity: number }[],
    opts?: { notify?: boolean },
  ) {
    const decoded = decodeURIComponent(convId);
    const stateKey = await this.resolveStateKey(decoded);
    const meta = await this.waMessages.getConversationMeta(decoded);
    if (!meta.activeCart) {
      throw new BadRequestException('No hay carrito activo en esta conversación');
    }

    const current = await this.cart.getCart(stateKey);
    const nextItems: CartItem[] = [];

    for (const line of items) {
      if (line.quantity <= 0) continue;
      const product = await this.prisma.product.findUnique({ where: { id: line.productId } });
      if (!product || !product.isActive) {
        throw new NotFoundException(`Producto no encontrado: ${line.productId}`);
      }
      await this.stock.assertAvailable(
        line.productId,
        line.quantity,
        { excludeStateKey: stateKey },
        product.nombre,
      );
      const existing = current.items.find((i) => i.productId === line.productId);
      nextItems.push({
        productId: product.id,
        nombre: product.nombre,
        quantity: line.quantity,
        unitPrice: existing?.unitPrice ?? Number(product.salePrice),
        costAtSale: existing?.costAtSale ?? Number(product.costPrice),
      });
    }

    await this.cart.clearCart(stateKey);

    let cart = await this.cart.getCart(stateKey);
    for (const item of nextItems) {
      cart = await this.cart.addItem(stateKey, item);
    }

    if (cart.items.length === 0) {
      await this.cartHold.release(stateKey);
    } else {
      await this.cartHold.syncFromCart(stateKey, cart, {
        chatId: stateKey,
        contactPhone: meta.session?.customerPhone ?? meta.customer?.phone ?? null,
        customerName: meta.session?.customerName ?? meta.customer?.name ?? null,
      });
    }

    const notify = opts?.notify !== false;
    if (notify) {
      const { waChatId, waSessionId } = this.waMessages.resolveSendTarget(decoded);
      const name = meta.session?.customerName ?? meta.customer?.name;
      const saludo = name?.trim() ? `Hola *${name.trim()}*, ` : 'Hola, ';
      const text =
        cart.items.length === 0
          ? `${saludo}tu carrito quedó vacío. Si quieres ver productos, escribe *catálogo*.`
          : `${saludo}tu asesor en *${this.storeName()}* actualizó tu carrito:\n\n` +
            `${this.formatCartLines(cart.items, cart.total)}\n\n` +
            `¿Te parece bien? Escríbenos *confirmar pedido* o cuéntanos si quieres cambiar algo.`;
      await this.openwa.sendText({
        chatId: waChatId,
        sessionId: waSessionId,
        text,
        source: 'agent',
      });
    }

    return { ok: true, cart };
  }
}
