/** Normaliza mensajes WhatsApp para detección de intención en n8n. */
export function normalizeChatMessage(message: unknown): string {
  return String(message ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[*_~`]/g, '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function isGreetingLikeMessage(message: unknown): boolean {
  const msg = normalizeChatMessage(message);
  if (!msg) return true;
  // Números de menú/cantidad (1, 2, 5…) no son saludos
  if (/^\d+$/.test(msg)) return false;
  if (/^(hola|buenas|buenos|hey|hi|hello|saludos|que tal|ola)[\s!.?,]*$/.test(msg)) return true;
  if (msg.length <= 30 && /\b(hola|buenas|buenos|hey|saludos)\b/.test(msg)) return true;
  return false;
}

export function isBrowsePhase(phase?: string): boolean {
  return (
    phase === 'browse_categories' ||
    phase === 'browse_products' ||
    phase === 'product_detail'
  );
}

export function isCheckoutPhase(phase?: string): boolean {
  return (
    phase === 'checkout_name' ||
    phase === 'checkout_address' ||
    phase === 'checkout_reference' ||
    phase === 'checkout_confirm'
  );
}
