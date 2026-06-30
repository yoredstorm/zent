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
    for (const phone of phones) {
      try {
        await this.openwa.sendText({ chatId: this.toChatId(phone), text });
        this.logger.log(`Vendor notified for order ${order.id.slice(0, 8)} → ${phone}`);
      } catch (err) {
        this.logger.warn(`Vendor notify failed (${phone}): ${err}`);
      }
    }
  }
}
