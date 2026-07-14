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

// Fases desde las que un texto libre se interpreta como búsqueda de producto.
const FASES_BUSQUEDA = ['greeting', 'main_menu', 'browse_categories', 'browse_products', 'product_detail'];

/**
 * Comandos de navegación INEQUÍVOCOS (mensaje corto que ES el comando).
 * Estos escapan de CUALQUIER fase — incluido el checkout — sin confundir una
 * dirección/nombre que casualmente contenga la palabra (p. ej. "av. catálogo 5").
 */
function comandoNavegacion(msj) {
  if (/^(menu|inicio|menu principal|volver al inicio|empezar de nuevo|volver al menu)$/.test(msj)) return 'menu';
  if (/^(cancelar|cancela|salir|salgo|olvidalo|ya no|dejalo)$/.test(msj)) return 'carrito';
  if (/^(catalogo|ver catalogo|productos|ver productos|quiero comprar|comprar)$/.test(msj)) return 'catalogo';
  if (/^(carrito|mi carrito|ver carrito)$/.test(msj)) return 'carrito';
  if (/^(mi pedido|estado|estado de mi pedido|seguimiento|donde esta mi pedido)$/.test(msj)) return 'pedido';
  return null;
}

function enrutarGrupo(fase, intencion, msj) {
  const enCheckout = FASES_CHECKOUT.includes(fase);

  // 1) El asesor siempre gana (escapa incluso del checkout).
  if (intencion === 'asesor' || fase === 'handoff') return 'asesor';

  // 2) Comandos de navegación inequívocos: escapan de cualquier fase.
  const nav = comandoNavegacion(msj);
  if (nav) return nav;

  // 3) Dentro del checkout, todo lo demás es respuesta al paso actual.
  if (enCheckout) return 'checkout';

  // 4) Fuera del checkout: intención global.
  if (intencion === 'reinicio' || intencion === 'saludo') return 'menu';
  if (intencion === 'catalogo_pdf') return 'menu';
  if (intencion === 'catalogo') return 'catalogo';
  if (intencion === 'estado_pedido') return 'pedido';
  if (intencion === 'carrito') return 'carrito';
  if (/confirmar|finalizar|checkout/.test(msj)) return 'carrito';

  // 5) Menú numerado (1 catálogo · 2 mi pedido · 3 asesor) desde el menú/saludo.
  if ((fase === 'main_menu' || fase === 'greeting') && intencion === 'numero') {
    if (/^1$/.test(msj)) return 'catalogo';
    if (/^2$/.test(msj)) return 'pedido';
    if (/^3$/.test(msj)) return 'asesor';
  }

  // 6) Texto libre desde el menú o navegando → búsqueda de producto (flujo Catálogo).
  if (intencion === 'libre' && FASES_BUSQUEDA.includes(fase)) return 'catalogo';

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
    aiHybrid: contexto.aiHybrid === true,
  };
}

if (typeof module !== 'undefined') {
  Object.assign(global, require('./intencion.js'));
  module.exports = { FASES_CHECKOUT, GRUPO_POR_FASE, enrutarGrupo, prepararContexto };
}
