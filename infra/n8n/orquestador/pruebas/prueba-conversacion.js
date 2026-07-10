/**
 * Prueba E2E: ejercita el MISMO punto de entrada que producción
 * (`orquestarMensaje`, el nodo único "Orquestar") con un backend simulado.
 *
 * El bridge real hace bootstrap de la sesión y la pasa en context.session; aquí
 * simulamos eso manteniendo `session` en memoria: `chat.session.patch` la actualiza
 * igual que el backend (merge superficial de flow), y el siguiente turno la relee.
 */
const { orquestarMensaje } = require('../nucleo/orquestador.js');

const normaliza = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

// --- Backend simulado -------------------------------------------------------
const categorias = [
  { id: 'c1', name: 'oficina', productCount: 2 },
  { id: 'c2', name: 'arte', productCount: 1 },
];
const productosPorCategoria = {
  c1: [
    { id: 'p1', name: 'papel grueso', price: 50, lowStock: false, imageUrl: '/api/uploads/p1.jpg', description: 'papel para imprimir' },
    { id: 'p2', name: 'regla', price: 30, lowStock: false, imageUrl: null, description: null },
  ],
  c2: [
    {
      id: 'p3',
      name: 'acuarelas',
      price: 80,
      lowStock: true,
      imageUrl: null,
      description: null,
      atributos: 'Marca: Faber',
      variantes: [
        { id: 'v1', etiqueta: '12 colores', precio: 80, stock: 4 },
        { id: 'v2', etiqueta: '24 colores', precio: 120, stock: 2 },
      ],
    },
  ],
};

let carritoMemoria = { items: [], subtotal: 0, deliveryCost: 0, total: 0 };
let pedidosCreados = [];
let handoffCount = 0;

let session = {
  storeName: 'ohana',
  customer: { found: true, name: 'Pablo', address: 'Av. Lima 123', reference: 'portón azul' },
  flow: { phase: 'greeting' },
  cart: { items: [], total: 0 },
  cartTtlMinutes: 30,
};

function recalcular() {
  carritoMemoria.subtotal = carritoMemoria.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  carritoMemoria.total = carritoMemoria.subtotal + (carritoMemoria.deliveryCost || 0);
}

function mockBackend(nombre, cuerpo) {
  switch (nombre) {
    case 'categories.list':
      return { categories: categorias };
    case 'products.by_category':
      return { products: productosPorCategoria[cuerpo.categoryId] || [] };
    case 'products.search': {
      const q = normaliza(cuerpo.query || '');
      const todos = Object.values(productosPorCategoria).flat();
      const hits = todos.filter(
        (p) => (q && q.includes(normaliza(p.name))) || (q && normaliza(p.name).includes(q)),
      );
      return { products: hits };
    }
    case 'products.send_image':
      return { sent: true, productId: cuerpo.productId };
    case 'cart.get':
      return { ...carritoMemoria };
    case 'cart.add_item': {
      const todos = Object.values(productosPorCategoria).flat();
      const prod = todos.find((p) => p.id === cuerpo.productId);
      const variante = cuerpo.variantId
        ? (prod.variantes || []).find((v) => v.id === cuerpo.variantId)
        : null;
      carritoMemoria.items.push({
        productId: prod.id,
        nombre: variante ? `${prod.name} (${variante.etiqueta})` : prod.name,
        quantity: cuerpo.quantity,
        unitPrice: variante ? variante.precio : prod.price,
        variantId: variante ? variante.id : undefined,
      });
      recalcular();
      return { cart: { ...carritoMemoria }, reservedMinutes: 30 };
    }
    case 'cart.remove_item': {
      carritoMemoria.items = carritoMemoria.items.filter((i) => i.productId !== cuerpo.productId);
      recalcular();
      return { cart: { ...carritoMemoria }, reservedMinutes: 30 };
    }
    case 'cart.clear':
      carritoMemoria = { items: [], subtotal: 0, deliveryCost: 0, total: 0 };
      return { ok: true };
    case 'orders.create_from_chat':
      pedidosCreados.push(cuerpo);
      return { orderId: 'ord-abcd1234', shortId: 'ord-abcd' };
    case 'chat.handoff':
      handoffCount += 1;
      return { ok: true };
    case 'chat.session.patch':
      session.flow = { ...(session.flow || {}), ...(cuerpo.flow || {}) };
      return { flow: session.flow };
    default:
      return null;
  }
}

const helpers = {
  async httpRequest({ url, body }) {
    const nombre = url.split('/tools/')[1];
    return mockBackend(nombre, body || {});
  },
};

async function enviar(mensaje) {
  const cuerpo = {
    chatId: 'x',
    waSessionId: 's',
    contactPhone: '51999999999',
    message: mensaje,
    context: {
      zentApiUrl: 'http://mock/api',
      zentN8nSecret: 'secreto',
      session,
      stateKey: 's::x',
    },
  };
  return orquestarMensaje(cuerpo, helpers);
}

function fase() {
  return session.flow?.phase;
}

function verificar(paso, r, cond, detalle) {
  if (/momentito|segundito|voy a mirarlo/i.test(r.reply)) {
    console.error(`FAIL paso ${paso}: filler:`, r.reply);
    process.exit(1);
  }
  if (!cond) {
    console.error(`FAIL paso ${paso}: ${detalle}\nReply: ${JSON.stringify(r.reply)}\nFase: ${fase()}`);
    process.exit(1);
  }
}

(async () => {
  // 1. hola → saludo + menú
  let r = await enviar('hola');
  verificar(1, r, /pablo/i.test(r.reply) && fase() === 'main_menu', 'saludo con nombre');

  // 2. "1" (menú numerado) → categorías
  r = await enviar('1');
  verificar(2, r, /oficina/i.test(r.reply) && /arte/i.test(r.reply) && fase() === 'browse_categories', 'menú numerado 1 → catálogo');

  // 3. "1" → productos de oficina
  r = await enviar('1');
  verificar(3, r, /papel grueso/i.test(r.reply) && /regla/i.test(r.reply) && fase() === 'browse_products', 'productos de oficina');

  // 4. "2" → detalle de regla (sin imagen) + pedir cantidad
  r = await enviar('2');
  verificar(4, r, /regla/i.test(r.reply) && /cantidad|cu[aá]ntas/i.test(r.reply) && fase() === 'product_detail', 'detalle regla');

  // 5. "5" → agrega 5 reglas (5 x 30 = 150)
  r = await enviar('5');
  verificar(5, r, /regla/i.test(r.reply) && /150\.00/.test(r.reply) && fase() === 'cart', 'carrito con total real');

  // 6. catálogo desde el carrito → categorías (regresión "momentito")
  r = await enviar('catalogo');
  verificar(6, r, /oficina/i.test(r.reply) && fase() === 'browse_categories', 'catálogo desde carrito');

  // 7. "1" → oficina
  r = await enviar('1');
  verificar(7, r, /papel grueso/i.test(r.reply) && fase() === 'browse_products', 'oficina otra vez');

  // 8. "1" → detalle de papel grueso (con imagen) + cantidad
  r = await enviar('1');
  verificar(8, r, /cantidad|cu[aá]ntas/i.test(r.reply) && fase() === 'product_detail', 'detalle papel (imagen)');

  // 9. "2" → agrega 2 papel (2 x 50 = 100) → total 250
  r = await enviar('2');
  verificar(9, r, /papel grueso/i.test(r.reply) && /250\.00/.test(r.reply) && fase() === 'cart', 'carrito con dos productos');

  // 10. "quita 2" → quita el 2º ítem (papel) → queda regla (150) [NUEVO]
  r = await enviar('quita 2');
  verificar(10, r, /papel grueso/i.test(r.reply) && /150\.00/.test(r.reply) && fase() === 'cart', 'quitar del carrito');
  if (carritoMemoria.items.length !== 1 || carritoMemoria.items[0].productId !== 'p2') {
    console.error('FAIL paso 10: el carrito no quedó con solo la regla', carritoMemoria.items);
    process.exit(1);
  }

  // 11. hola → menú (carrito se conserva)
  r = await enviar('hola');
  verificar(11, r, /pablo/i.test(r.reply) && fase() === 'main_menu', 'hola resetea a menú');

  // 12. "buenas quiero la regla" → NO se trata como saludo; busca y encuentra la regla [NUEVO]
  r = await enviar('buenas quiero la regla');
  verificar(12, r, /regla/i.test(r.reply) && fase() === 'browse_products', 'saludo laxo NO resetea; busca producto');

  // 13. confirmar pedido → checkout con dirección guardada
  r = await enviar('confirmar pedido');
  verificar(13, r, fase() === 'checkout_address' && /av\. lima 123/i.test(r.reply), 'confirmar → checkout dirección guardada');

  // 14. "menú" DURANTE el checkout → escapa (fix "atrapado en checkout") [NUEVO]
  r = await enviar('menu');
  verificar(14, r, fase() === 'main_menu', 'escape de checkout con "menú"');
  if (!carritoMemoria.items.length) {
    console.error('FAIL paso 14: escapar del checkout no debe vaciar el carrito');
    process.exit(1);
  }

  // 15. confirmar pedido de nuevo → checkout dirección
  r = await enviar('confirmar pedido');
  verificar(15, r, fase() === 'checkout_address' && /av\. lima 123/i.test(r.reply), 'reingreso a checkout');

  // 16. si → usa dirección + referencia guardadas → resumen final
  r = await enviar('si');
  verificar(16, r, fase() === 'checkout_confirm' && /av\. lima 123/i.test(r.reply) && /150\.00/.test(r.reply), 'resumen final');

  // 17. si → pedido creado + carrito limpio + main_menu
  r = await enviar('si');
  verificar(17, r, /pedido|registr/i.test(r.reply) && fase() === 'main_menu', 'pedido confirmado');
  if (pedidosCreados.length !== 1) {
    console.error('FAIL paso 17: se esperaba exactamente 1 pedido', pedidosCreados.length);
    process.exit(1);
  }
  if (carritoMemoria.items.length) {
    console.error('FAIL paso 17: el carrito no se limpió');
    process.exit(1);
  }

  // 18. Guard anti-duplicado: reingreso a checkout_confirm con carrito vacío y lastOrderId
  //     → NO crea un 2º pedido. [NUEVO]
  session.flow = { phase: 'checkout_confirm', checkout: {}, lastOrderId: 'ord-abcd1234' };
  r = await enviar('si');
  verificar(18, r, /registr|qued/i.test(r.reply) && fase() === 'main_menu', 'guard anti-duplicado');
  if (pedidosCreados.length !== 1) {
    console.error('FAIL paso 18: se duplicó el pedido', pedidosCreados.length);
    process.exit(1);
  }

  // 19. asesor → handoff (una sola vez)
  r = await enviar('asesor');
  verificar(19, r, r.handoff === true && /asesor|persona|equipo/i.test(r.reply) && fase() === 'handoff', 'handoff');
  if (handoffCount !== 1) {
    console.error('FAIL paso 19: chat.handoff debía llamarse una vez, van', handoffCount);
    process.exit(1);
  }

  // 20. asesor de nuevo (ya en handoff) → NO re-dispara handoff ni responde [NUEVO]
  r = await enviar('asesor');
  verificar(20, r, r.reply === '' && r.handoff === false, 'handoff no pegajoso');
  if (handoffCount !== 1) {
    console.error('FAIL paso 20: se re-disparó chat.handoff', handoffCount);
    process.exit(1);
  }

  console.log('OK conversacion completa (20 pasos, punto de entrada real)');
})();
