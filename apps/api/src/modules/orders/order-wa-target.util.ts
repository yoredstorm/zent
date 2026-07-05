import { parseWaConversationId } from '../whatsapp-inbox/wa-conversation.util';

export interface OrderWaNotifyTarget {
  chatId: string;
  waSessionId?: string;
}

/** Resolves WhatsApp JID (+ optional session) from order chatId or customer phone. */
export function resolveOrderWaTarget(order: {
  chatId?: string | null;
  customerPhone: string;
}): OrderWaNotifyTarget | null {
  const raw = order.chatId?.trim();
  if (raw) {
    const { waSessionId, waChatId } = parseWaConversationId(raw);
    if (waChatId.includes('@')) {
      return { chatId: waChatId, waSessionId: waSessionId ?? undefined };
    }
  }

  const digits = order.customerPhone.replace(/\D/g, '');
  if (digits.length >= 9) {
    return { chatId: `${digits}@c.us` };
  }

  return null;
}
