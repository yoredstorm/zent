/**
 * Núcleo de enrutamiento — decide qué flujo atiende el mensaje.
 * Única fuente de verdad: la usan el nodo "Preparar Contexto" y las pruebas.
 */

const FASES_CHECKOUT = ['checkout_name', 'checkout_address', 'checkout_reference', 'checkout_confirm'];

const GRUPO_POR_FASE = {
  greeting: 'menu',
  main_menu: 'menu',
  browse_categories: 'catalogo',
  browse_products: 'catalogo',
  product_detail: 'catalogo',
  cart: 'carrito',
  checkout_name: 'checkout',
  checkout_address: 'checkout',
  checkout_reference: 'checkout',
  checkout_confirm: 'checkout',
  order_status: 'pedido',
  handoff: 'asesor',
};

function enrutarGrupo(fase, intencion, msj) {
  const enCheckout = FASES_CHECKOUT.includes(fase);
  if (intencion === 'asesor' || fase === 'handoff') return 'asesor';
  if (!enCheckout && (intencion === 'reinicio' || intencion === 'saludo')) return 'menu';
  if (!enCheckout && intencion === 'catalogo_pdf') return 'menu';
  if (!enCheckout && intencion === 'catalogo') return 'catalogo';
  if (!enCheckout && intencion === 'estado_pedido') return 'pedido';
  if (!enCheckout && intencion === 'carrito') return 'carrito';
  if (!enCheckout && /confirmar|finalizar|checkout/.test(msj)) return 'carrito';
  return GRUPO_POR_FASE[fase] || 'menu';
}

/** Convierte el webhook crudo en los datos que consumen todos los nodos de flujo. */
function prepararContexto(cuerpo) {
  const contexto = cuerpo.context ?? {};
  const sesion = contexto.session ?? {};
  const mensaje = String(cuerpo.message ?? cuerpo.text ?? '').trim();
  const msj = normalizarMensaje(mensaje);
  const intencion = detectarIntencion(msj);
  const fase = sesion.flow?.phase || 'greeting';
  const claveEstado =
    contexto.stateKey ||
    (cuerpo.waSessionId ? cuerpo.waSessionId + '::' + cuerpo.chatId : cuerpo.chatId);
  return {
    grupo: enrutarGrupo(fase, intencion, msj),
    fase,
    mensaje,
    msj,
    intencion,
    sesion,
    entrada: {
      chatId: cuerpo.chatId,
      waSessionId: cuerpo.waSessionId,
      contactPhone: cuerpo.contactPhone,
    },
    claveEstado,
    apiUrl: contexto.zentApiUrl || 'http://backend-api:3000/api',
    secreto: contexto.zentN8nSecret || '',
  };
}

if (typeof module !== 'undefined') {
  Object.assign(global, require('./intencion.js'));
  module.exports = { FASES_CHECKOUT, GRUPO_POR_FASE, enrutarGrupo, prepararContexto };
}
