import { OrderStatus } from '@prisma/client';

export interface OrderNotifyItem {
  quantity: number;
  requestedQuantity?: number | null;
  unitPrice: number | { toString(): string };
  product?: { nombre: string } | null;
}

export interface OrderNotifyPayload {
  id: string;
  customerName: string;
  address?: string | null;
  subtotal: number | { toString(): string };
  total: number | { toString(): string };
  deliveryCost?: number | { toString(): string } | null;
  items: OrderNotifyItem[];
}

function n(value: number | { toString(): string }): number {
  return Number(value);
}

function requestedQty(item: OrderNotifyItem): number {
  return item.requestedQuantity ?? item.quantity;
}

function itemSubtotal(qty: number, unitPrice: number): number {
  return qty * unitPrice;
}

export function orderRequestedSubtotal(order: OrderNotifyPayload): number {
  return order.items.reduce(
    (sum, item) => sum + itemSubtotal(requestedQty(item), n(item.unitPrice)),
    0,
  );
}

export function orderConfirmedSubtotal(order: OrderNotifyPayload): number {
  return order.items.reduce(
    (sum, item) => sum + itemSubtotal(item.quantity, n(item.unitPrice)),
    0,
  );
}

export function orderHasItemChanges(order: OrderNotifyPayload): boolean {
  return order.items.some((item) => {
    const requested = requestedQty(item);
    return item.quantity !== requested || (item.quantity === 0 && requested > 0);
  });
}

export function buildDeliveryOnTheWayMessage(order: OrderNotifyPayload): string {
  const shortId = order.id.slice(0, 8);
  let msg =
    `🚚 *¡Tu pedido #${shortId} ya está en camino!*\n\n` +
    `Hola *${order.customerName}*, tu pedido salió para entrega.`;
  if (order.address?.trim()) {
    msg += `\n\n📍 *Dirección:* ${order.address.trim()}`;
  }
  msg += '\n\nTe avisaremos cuando la entrega esté completada. ¡Gracias por tu compra!';
  return msg;
}

export function buildCompletedOrderMessage(order: OrderNotifyPayload): string {
  const shortId = order.id.slice(0, 8);
  const delivery = order.deliveryCost != null ? n(order.deliveryCost) : 0;
  const requestedSub = orderRequestedSubtotal(order);
  const confirmedTotal = n(order.total);
  const requestedTotal = requestedSub + delivery;
  const hasChanges = orderHasItemChanges(order);
  const totalsDiffer = Math.abs(requestedTotal - confirmedTotal) > 0.009;

  let msg =
    `✅ *¡Pedido #${shortId} entregado!*\n\n` +
    `Hola *${order.customerName}*, aquí el detalle de lo que recibiste:\n\n`;

  if (hasChanges) {
    msg += '📋 *Confirmación del pedido:*\n';
    for (const item of order.items) {
      const name = item.product?.nombre ?? 'Producto';
      const requested = requestedQty(item);
      const confirmed = item.quantity;
      const price = n(item.unitPrice);

      if (confirmed <= 0 && requested > 0) {
        msg += `• ${name}: pediste *${requested}* → *no incluido*\n`;
      } else if (confirmed !== requested) {
        msg += `• ${name}: pediste *${requested}* → confirmado *${confirmed}* (S/ ${itemSubtotal(confirmed, price).toFixed(2)})\n`;
      } else if (confirmed > 0) {
        msg += `• ${confirmed}x ${name} — S/ ${itemSubtotal(confirmed, price).toFixed(2)}\n`;
      }
    }
  } else {
    msg += '📋 *Resumen:*\n';
    for (const item of order.items) {
      if (item.quantity <= 0) continue;
      const name = item.product?.nombre ?? 'Producto';
      const price = n(item.unitPrice);
      msg += `• ${item.quantity}x ${name} — S/ ${itemSubtotal(item.quantity, price).toFixed(2)}\n`;
    }
  }

  if (hasChanges || totalsDiffer) {
    msg += `\n💰 *Total solicitado:* S/ ${requestedTotal.toFixed(2)}`;
    msg += `\n💰 *Total confirmado:* S/ ${confirmedTotal.toFixed(2)}`;
  } else {
    msg += `\n💰 *Total:* S/ ${confirmedTotal.toFixed(2)}`;
  }

  if (delivery > 0 && !(hasChanges || totalsDiffer)) {
    msg += `\n🚚 *Delivery incluido:* S/ ${delivery.toFixed(2)}`;
  }

  msg += '\n\n¡Gracias por tu compra! 🙏\n\nEscribe *menu* para hacer un nuevo pedido.';
  return msg;
}

export function buildStatusNotifyMessage(
  status: OrderStatus,
  order: OrderNotifyPayload,
): string | null {
  if (status === 'EN_DELIVERY') return buildDeliveryOnTheWayMessage(order);
  if (status === 'COMPLETADO') return buildCompletedOrderMessage(order);
  return null;
}
