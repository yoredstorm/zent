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

const MAIN_MENU_TEXT =
  '¿En qué te ayudo?\n• *Catálogo PDF* — catálogo completo\n• *Catálogo* — productos por categoría\n• *Mi pedido* — estado de tu compra\n• *Asesor* — hablar con una persona';

function timeGreeting(localHour?: number): string {
  const h = typeof localHour === 'number' ? localHour : new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Saludo + menú cuando n8n no responde (misma intención que flujoMenu). */
export function buildN8nGreetingFallback(session: {
  storeName?: string;
  localHour?: number;
  customer?: {
    found?: boolean;
    name?: string;
    totalOrders?: number;
    isReturning?: boolean;
  };
}): string {
  const store = session.storeName?.trim() || 'Zent';
  const tg = timeGreeting(session.localHour);
  const customer = session.customer;
  let greeting: string;
  if (customer?.found && customer.isReturning && customer.name) {
    greeting = `¡Qué bueno verte otra vez, *${customer.name}*! Ya llevas *${customer.totalOrders ?? 0}* pedidos con *${store}* 🙌`;
  } else if (customer?.found && customer.name) {
    greeting = `${tg}! *${customer.name}*, qué gusto saludarte en *${store}* 😊`;
  } else {
    greeting = `${tg}! *${store}* te saluda 😊`;
  }
  return `${greeting}\n\n${MAIN_MENU_TEXT}`;
}
