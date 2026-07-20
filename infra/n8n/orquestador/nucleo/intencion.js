/** Núcleo de intención — normalización y detección de intención global del mensaje. */

function normalizarMensaje(mensaje) {
  return String(mensaje || '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[*_~`]/g, '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^[^\w]+|[^\w]+$/g, '');
}

function esSaludo(msj) {
  if (!msj) return true;
  if (/^\d+$/.test(msj)) return false;
  if (/^(hola+|buenas|buenos dias|buenas tardes|buenas noches|buen dia|hey|hi|hello|saludos|que tal|ola|holi)[\s!.?,]*$/.test(msj)) {
    return true;
  }
  // "buenas, quiero la regla" NO es saludo: quita las palabras de saludo y mira si queda algo.
  const resto = msj
    .replace(/\b(hola+|buenas|buenos|buen|dias|tardes|noches|dia|hey|hi|hello|saludos|que|tal|ola|holi)\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return resto.length <= 3;
}

function detectarIntencion(msj) {
  if (/^(menu|inicio|empezar de nuevo|volver al inicio)/.test(msj)) return 'reinicio';
  if (/^\d+$/.test(msj)) return 'numero';
  if (/confirmar pedido|confirmo pedido|finalizar pedido/.test(msj)) return 'confirmar';
  if (/^confirmar$|^confirmo$|^finalizar$|^checkout$/.test(msj)) return 'confirmar';
  if (/^si$|^ok$|^dale$|^claro$|^yes$|^ya$/.test(msj)) return 'confirmar';
  if (/^no$|^nop$|^cancelar$/.test(msj)) return 'negar';
  if (esSaludo(msj)) return 'saludo';
  if (/asesor|humano|persona|agente|hablar con/.test(msj)) return 'asesor';
  if (/pedido|estado|seguimiento|donde esta|mi compra/.test(msj)) return 'estado_pedido';
  // "envíame/mándame/pásame el catálogo" (en cualquier orden) → mandar el PDF.
  const pideEnvioCatalogo = /catalogo/.test(msj) && /envi|manda|pasa/.test(msj);
  if (/pdf|catalogo completo|catalogo pdf|ver pdf/.test(msj) || pideEnvioCatalogo) return 'catalogo_pdf';
  if (/catalogo|productos|comprar|venta|ver productos/.test(msj)) return 'catalogo';
  if (/carrito|ver carrito|mi carrito/.test(msj)) return 'carrito';
  return 'libre';
}

function esAfirmativo(msj) {
  return /^(si|confirmo|confirmar|ok|dale|claro|yes|ya)$/.test(msj);
}

function pareceIdPedido(msj) {
  return /^[a-f0-9-]{6,}$/i.test(msj.trim()) || /^#?[a-f0-9]{6,8}$/i.test(msj.trim());
}

/** "quita la regla", "elimina 2", "sacar del carrito" → intención de quitar del carrito. */
function esQuitar(msj) {
  return /^(quita(r)?|elimina(r)?|borra(r)?|remueve(r)?|remover|saca(r)?)\b/.test(msj);
}

/** Devuelve lo que queda tras el verbo de quitar: un número o un nombre. */
function referenciaQuitar(msj) {
  return msj
    .replace(/^(quita(r)?|elimina(r)?|borra(r)?|remueve(r)?|remover|saca(r)?)\s*/, '')
    .replace(/\b(el|la|los|las|un|una|del|de|carrito|producto|item|articulo)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "más", "ver más", "siguiente" → pedir la siguiente página del listado. */
function esVerMas(msj) {
  return /^(mas|ver mas|mostrar mas|siguiente|siguiente pagina|otra pagina|mas productos|continuar)$/.test(msj);
}

/**
 * "foto 2", "ver foto 1", "imagen 3" → pedir la foto de esa opción numerada.
 * Usa un prefijo textual a propósito: un dígito pelado ("2") sigue significando
 * SIEMPRE "elegir esa opción", nunca "ver su foto" — así no hay ambigüedad.
 * Devuelve el número (1-based) o null si el mensaje no calza con el patrón.
 */
function esVerFotoOpcion(msj) {
  const m = msj.match(/^(?:ver\s+)?(?:foto|imagen)\s*(\d+)$/);
  return m ? parseInt(m[1], 10) : null;
}

if (typeof module !== 'undefined') {
  module.exports = {
    normalizarMensaje,
    esSaludo,
    detectarIntencion,
    esAfirmativo,
    pareceIdPedido,
    esQuitar,
    referenciaQuitar,
    esVerMas,
    esVerFotoOpcion,
  };
}
