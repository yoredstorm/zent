import { normalizePhone } from '../customers/customers.service';

/** Extrae dígitos de JID @c.us / @s.whatsapp.net; null para @lid u otros. */
export function extractPhoneFromWaId(id: string): string | null {
  if (!id) return null;
  const match = id.match(/^(\d+)@(c\.us|s\.whatsapp\.net)$/);
  return match ? match[1] : null;
}

/** Teléfono del contacto: senderPhone del webhook, JID clásico, o null si es solo @lid. */
export function resolvePhoneFromIds(
  chatId: string,
  from: string,
  senderPhone?: string,
): string | null {
  if (senderPhone?.trim()) {
    const digits = normalizePhone(senderPhone);
    if (digits.length >= 8) return digits;
  }
  return extractPhoneFromWaId(from) ?? extractPhoneFromWaId(chatId);
}

export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return 'tu número de WhatsApp';
  return phone.startsWith('+') ? phone : `+${phone}`;
}
