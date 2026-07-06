function normalizeInput(message) {
  return String(message || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[*_~`]/g, '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^[^\w]+|[^\w]+$/g, '');
}

function isGreetingLike(msg) {
  if (!msg) return true;
  if (/^\d+$/.test(msg)) return false;
  if (/^(hola|buenas|buenos|hey|hi|hello|saludos|que tal|ola)[\s!.?,]*$/.test(msg)) return true;
  if (msg.length <= 30 && /\b(hola|buenas|buenos|hey|saludos)\b/.test(msg)) return true;
  return false;
}

function detectGlobalIntent(msg) {
  if (/^(menu|inicio|empezar de nuevo|volver al inicio)/.test(msg)) return 'reset';
  if (/^\d+$/.test(msg)) return 'number';
  if (/confirmar pedido|confirmo pedido|finalizar pedido/.test(msg)) return 'confirm';
  if (/^confirmar$|^confirmo$|^finalizar$|^checkout$/.test(msg)) return 'confirm';
  if (/^si$|^ok$|^dale$|^claro$|^yes$|^ya$/.test(msg)) return 'confirm';
  if (/^no$|^nop$|^cancelar$/.test(msg)) return 'no';
  if (isGreetingLike(msg)) return 'greeting';
  if (/asesor|humano|persona|agente|hablar con/.test(msg)) return 'handoff';
  if (/pedido|estado|seguimiento|donde esta|donde está|mi compra/.test(msg)) return 'order_status';
  if (/pdf|catalogo completo|catálogo completo|catalogo pdf|catálogo pdf|ver pdf/.test(msg)) {
    return 'catalog_pdf';
  }
  if (/catalogo|catálogo|productos|comprar|venta|ver productos/.test(msg)) return 'catalog';
  if (/carrito|ver carrito|mi carrito/.test(msg)) return 'cart';
  if (/^no$|^nop|cambiar/.test(msg)) return 'no';
  return 'freeform';
}

function isAffirmative(msg) {
  return /^(si|confirmo|confirmar|ok|dale|claro|yes|ya)$/.test(msg);
}

function isSavedAddressConfirmation(msg, customer) {
  return isAffirmative(msg) && Boolean(customer?.address);
}

function looksLikeOrderId(msg) {
  return /^[a-f0-9-]{6,}$/i.test(msg.trim()) || /^#?[a-f0-9]{6,8}$/i.test(msg.trim());
}

if (typeof module !== 'undefined') {
  module.exports = {
    normalizeInput,
    isGreetingLike,
    detectGlobalIntent,
    isAffirmative,
    isSavedAddressConfirmation,
    looksLikeOrderId,
  };
}
