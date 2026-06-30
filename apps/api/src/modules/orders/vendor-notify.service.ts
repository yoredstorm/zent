import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenwaService } from '../openwa/openwa.service';

interface VendorOrderNotify {
  id: string;
  customerName: string;
  customerPhone: string;
  address?: string | null;
  reference?: string | null;
  source: string;
  total: { toString(): string };
  items: Array<{
    quantity: number;
    unitPrice: { toString(): string };
    product?: { nombre: string } | null;
  }>;
}

@Injectable()
export class VendorNotifyService {
  private readonly logger = new Logger(VendorNotifyService.name);

  constructor(
    private openwa: OpenwaService,
    private config: ConfigService,
  ) {}

  private getVendorPhones(): string[] {
    const raw = this.config.get('VENDOR_NOTIFY_PHONES', '').trim();
    if (!raw) return [];
    return raw
      .split(',')
      .map((p: string) => p.trim().replace(/\D/g, ''))
      .filter((p: string) => p.length >= 9);
  }

  private toChatId(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return `${digits}@c.us`;
  }

  buildNewOrderMessage(order: VendorOrderNotify): string {
    const shortId = order.id.slice(0, 8);
    const lines = order.items
      .filter((i) => i.quantity > 0)
      .map((i) => {
        const name = i.product?.nombre ?? 'Producto';
        const sub = i.quantity * Number(i.unitPrice);
        return `- ${i.quantity}x ${name} — S/ ${sub.toFixed(2)}`;
      })
      .join('\n');

    let msg =
      `🛒 *NUEVO PEDIDO #${shortId}*\n\n` +
      `*Cliente:* ${order.customerName}\n` +
      `*Tel:* ${order.customerPhone}\n` +
      `*Origen:* ${order.source}\n\n` +
      `*Productos:*\n${lines || '- (sin ítems)'}\n\n` +
      `*Total:* S/ ${Number(order.total).toFixed(2)}\n`;

    if (order.address?.trim()) msg += `*Dirección:* ${order.address.trim()}\n`;
    if (order.reference?.trim()) msg += `*Referencia:* ${order.reference.trim()}\n`;

    msg +=
      '\n*Estado:* PENDIENTE DE ACEPTACIÓN\n' +
      'Revisa el dashboard y cambia a *CONFIRMADO*.';

    return msg;
  }

  async notifyNewOrder(order: VendorOrderNotify): Promise<void> {
    const phones = this.getVendorPhones();
    if (phones.length === 0) {
      this.logger.debug('VENDOR_NOTIFY_PHONES not set; skipping vendor notify');
      return;
    }

    const text = this.buildNewOrderMessage(order);
    await this.sendToVendors(phones, text, `order ${order.id.slice(0, 8)}`);
  }

  async notifyHandoffRequest(data: {
    chatId: string;
    customerName?: string | null;
    customerPhone?: string | null;
    waSessionId?: string;
  }): Promise<void> {
    const phones = this.getVendorPhones();
    if (phones.length === 0) return;

    const name = data.customerName?.trim() || 'Cliente';
    const phone = data.customerPhone?.trim() || 'sin teléfono';
    const text =
      `👤 *Cliente pide asesor humano*\n\n` +
      `*Nombre:* ${name}\n` +
      `*Tel:* ${phone}\n` +
      `*Chat:* ${data.chatId}\n\n` +
      `Atiéndelo desde el inbox de WhatsApp en el dashboard.`;

    await this.sendToVendors(phones, text, `handoff ${data.chatId}`);
  }

  private async sendToVendors(phones: string[], text: string, label: string): Promise<void> {
    for (const phone of phones) {
      try {
        const resolved = await this.openwa.resolveChatIdForPhone(phone);
        const chatId = resolved ?? this.toChatId(phone);
        if (!resolved) {
          this.logger.warn(
            `Vendor phone ${phone} may not have WhatsApp — sending to ${chatId} anyway`,
          );
        }
        await this.openwa.sendText({ chatId, text, source: 'bot' });
        this.logger.log(`Vendor notified (${label}) → ${phone} (${chatId})`);
      } catch (err) {
        this.logger.warn(`Vendor notify failed (${phone}): ${err}`);
      }
    }
  }
}
