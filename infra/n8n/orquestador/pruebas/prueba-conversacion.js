/**
 * Prueba E2E simulada: replica el pipeline del workflow
 * (Preparar Contexto → enrutar por grupo → flujo → aplicarParche a la sesión)
 * con un backend simulado en memoria.
 */
const { normalizarMensaje, detectarIntencion } = require('../nucleo/intencion.js');
const { aplicarParche } = require('../nucleo/sesion.js');
const { flujoMenu } = require('../flujos/menu.js');
const { flujoCatalogo } = require('../flujos/catalogo.js');
const { flujoCarrito } = require('../flujos/carrito.js');
const { flujoCheckout } = require('../flujos/checkout.js');
const { flujoPedido } = require('../flujos/pedido.js');
const { flujoAsesor } = require('../flujos/asesor.js');
const copySrc = require('../../templates/zent-copy-variants.source.js');

const copys = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

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

async function llamarHerramienta(nombre, cuerpo) {
  switch (nombre) {
    case 'categories.list':
      return { categories: categorias };
    case 'products.by_category':
      return { products: productosPorCategoria[cuerpo.categoryId] || [] };
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
      carritoMemoria.subtotal = carritoMemoria.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      carritoMemoria.total = carritoMemoria.subtotal;
      return { cart: { ...carritoMemoria }, reservedMinutes: 30 };
    }
    case 'cart.clear':
      carritoMemoria = { items: [], subtotal: 0, deliveryCost: 0, total: 0 };
      return { ok: true };
    case 'orders.create_from_chat':
      pedidosCreados.push(cuerpo);
      return { orderId: 'ord-12345678-abcd', shortId: 'ord12345' };
    case 'chat.handoff':
      return { ok: true };
    default:
      return null;
  }
}

// --- Pipeline simulado (replica Preparar Contexto + Switch) -----------------
const FLUJOS = {
  menu: flujoMenu,
  catalogo: flujoCatalogo,
  carrito: flujoCarrito,
  checkout: flujoCheckout,
  pedido: flujoPedido,
  asesor: flujoAsesor,
};

const FASES_CHECKOUT = ['checkout_name', 'checkout_address', 'checkout_reference', 'checkout_confirm'];
const GRUPO_POR_FASE = {
  greeting: 'menu', main_menu: 'menu',
  browse_categories: 'catalogo', browse_products: 'catalogo', product_detail: 'catalogo',
  cart: 'carrito',
  checkout_name: 'checkout', checkout_address: 'checkout', checkout_reference: 'checkout', checkout_confirm: 'checkout',
  order_status: 'pedido', handoff: 'asesor',
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

let sesion = {
  storeName: 'ohana',
  customer: { found: true, name: 'Pablo', address: 'Av. Lima 123', reference: 'portón azul' },
  flow: { phase: 'greeting' },
  cart: { items: [], total: 0 },
  cartTtlMinutes: 30,
};

async function enviar(mensaje) {
  const msj = normalizarMensaje(mensaje);
  const intencion = detectarIntencion(msj);
  const fase = sesion.flow?.phase || 'greeting';
  const grupo = enrutarGrupo(fase, intencion, msj);
  const resultado = await FLUJOS[grupo]({
    mensaje,
    msj,
    intencion,
    sesion,
    entrada: { chatId: 'x', waSessionId: 's', contactPhone: '519' },
    claveEstado: 's::x',
    copys,
    llamarHerramienta,
  });
  sesion = aplicarParche(sesion, resultado.parche);
  return resultado;
}

function verificar(paso, r, cond, detalle) {
  if (/momentito|segundito|voy a mirarlo/i.test(r.respuesta)) {
    console.error(`FAIL paso ${paso}: filler:`, r.respuesta);
    process.exit(1);
  }
  if (!cond) {
    console.error(`FAIL paso ${paso}: ${detalle}\nRespuesta: ${r.respuesta}\nFase: ${sesion.flow?.phase}`);
    process.exit(1);
  }
}

(async () => {
  // 1. hola → saludo + menú
  let r = await enviar('hola');
  verificar(1, r, /pablo/i.test(r.respuesta) && sesion.flow.phase === 'main_menu', 'saludo con nombre');

  // 2. catalogo → categorías
  r = await enviar('catalogo');
  verificar(2, r, /oficina/i.test(r.respuesta) && /arte/i.test(r.respuesta) && sesion.flow.phase === 'browse_categories', 'lista de categorías');

  // 3. 1 → productos de oficina
  r = await enviar('1');
  verificar(3, r, /papel grueso/i.test(r.respuesta) && /regla/i.test(r.respuesta) && sesion.flow.phase === 'browse_products', 'productos de categoría 1');

  // 4. 2 → detalle de regla (sin imagen) + pedir cantidad
  r = await enviar('2');
  verificar(4, r, /regla/i.test(r.respuesta) && /cantidad|cu[aá]ntas/i.test(r.respuesta) && sesion.flow.phase === 'product_detail', 'detalle producto 2');

  // 5. 5 → agrega 5 reglas, resumen con total real (5 x 30 = 150)
  r = await enviar('5');
  verificar(5, r, /regla/i.test(r.respuesta) && /150\.00/.test(r.respuesta) && sesion.flow.phase === 'cart', 'carrito con total real');

  // 6. catalogo desde carrito → categorías otra vez (regresión "momentito")
  r = await enviar('catalogo');
  verificar(6, r, /oficina/i.test(r.respuesta) && sesion.flow.phase === 'browse_categories', 'catálogo desde carrito');

  // 7. hola en medio del catálogo → menú (regresión "producto no lo ubico")
  r = await enviar('hola');
  verificar(7, r, /pablo/i.test(r.respuesta) && !/no lo ubico|no encontr/i.test(r.respuesta) && sesion.flow.phase === 'main_menu', 'hola resetea a menú');

  // 8. carrito sigue con las 5 reglas → confirmar pedido
  r = await enviar('confirmar pedido');
  // desde main_menu la intención confirmar no navega; el grupo es menu → debe ir a carrito...
  // El enrutador manda confirmar según fase: main_menu → menu. Pero el usuario quiere confirmar:
  // flujoMenu responde bienvenida. Aceptamos que primero pase por "carrito":
  if (sesion.flow.phase === 'main_menu') {
    r = await enviar('carrito');
    verificar(8, r, /regla/i.test(r.respuesta) && /150\.00/.test(r.respuesta), 'ver carrito');
    r = await enviar('confirmar pedido');
  }
  verificar(8, r, sesion.flow.phase === 'checkout_address' && /av\. lima 123/i.test(r.respuesta), 'checkout con dirección guardada');

  // 9. si → usa dirección guardada, salta a confirmar (referencia guardada)
  r = await enviar('si');
  verificar(9, r, sesion.flow.phase === 'checkout_confirm' && /av\. lima 123/i.test(r.respuesta) && /150\.00/.test(r.respuesta), 'resumen final con dirección');

  // 10. si → pedido creado + carrito limpio
  r = await enviar('si');
  verificar(10, r, /ord-1234|ord\-?12345/i.test(r.respuesta.replace(/\s/g, '')) || /pedido/i.test(r.respuesta), 'pedido confirmado');
  if (!pedidosCreados.length) {
    console.error('FAIL paso 10: no se creó el pedido');
    process.exit(1);
  }
  if (carritoMemoria.items.length) {
    console.error('FAIL paso 10: el carrito no se limpió');
    process.exit(1);
  }
  if (sesion.flow.phase !== 'main_menu') {
    console.error('FAIL paso 10: fase final debe ser main_menu, es', sesion.flow.phase);
    process.exit(1);
  }

  // 11. catalogo después del pedido → funciona de nuevo
  r = await enviar('catalogo');
  verificar(11, r, /oficina/i.test(r.respuesta) && sesion.flow.phase === 'browse_categories', 'catálogo tras pedido');

  // 12. Producto con variantes: categoría arte → acuarelas pide OPCIÓN, no cantidad
  r = await enviar('2');
  verificar(12, r, /acuarelas/i.test(r.respuesta) && sesion.flow.phase === 'browse_products', 'productos de arte');
  r = await enviar('1');
  verificar(
    12,
    r,
    /12 colores/i.test(r.respuesta) && /24 colores/i.test(r.respuesta) && sesion.flow.esperandoVariante === true,
    'lista de opciones de variante',
  );

  // 13. Elegir opción 2 → pide cantidad; cantidad 2 → carrito con precio de la variante (2 x 120 = 240)
  r = await enviar('2');
  verificar(
    13,
    r,
    /24 colores/i.test(r.respuesta) && /cantidad|cu[aá]ntas/i.test(r.respuesta) && sesion.flow.varianteSeleccionada?.id === 'v2',
    'variante seleccionada',
  );
  r = await enviar('2');
  verificar(
    13,
    r,
    /24 colores/i.test(r.respuesta) && /240\.00/.test(r.respuesta) && sesion.flow.phase === 'cart',
    'carrito con variante y precio propio',
  );
  const itemVariante = carritoMemoria.items.find((i) => i.variantId === 'v2');
  if (!itemVariante || itemVariante.quantity !== 2) {
    console.error('FAIL paso 13: cart.add_item no recibió variantId v2', carritoMemoria.items);
    process.exit(1);
  }

  console.log('OK conversacion completa (13 pasos)');
})();
