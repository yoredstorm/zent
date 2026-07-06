const { flujoCarrito } = require('../flujos/carrito.js');
const copySrc = require('../textos.js');

const copys = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

const carritoLleno = {
  items: [{ productId: 'p1', nombre: 'papel grueso', quantity: 5, unitPrice: 50 }],
  subtotal: 250,
  deliveryCost: 0,
  total: 250,
};

function ctxBase(extra = {}) {
  return {
    mensaje: 'que tengo',
    msj: 'que tengo',
    intencion: 'libre',
    sesion: {
      storeName: 'ohana',
      customer: { found: true, name: 'Pablo', address: 'Av. Lima 123' },
      flow: { phase: 'cart' },
      cart: { items: [], total: 0 }, // sesión DESACTUALIZADA a propósito
      cartTtlMinutes: 30,
    },
    entrada: { chatId: 'x', waSessionId: 's', contactPhone: '519' },
    claveEstado: 's::x',
    copys,
    llamarHerramienta: async (n) => (n === 'cart.get' ? carritoLleno : null),
    ...extra,
  };
}

function sinFiller(r, caso) {
  if (/momentito|segundito|voy a mirarlo/i.test(r.respuesta)) {
    console.error(`FAIL ${caso}: filler:`, r.respuesta);
    process.exit(1);
  }
}

(async () => {
  // 1. REGRESIÓN screenshot: sesión con carrito vacío pero cart.get tiene items → resumen con datos reales
  const r1 = await flujoCarrito(ctxBase());
  sinFiller(r1, 'resumen');
  if (!/papel grueso/i.test(r1.respuesta) || !/250\.00/.test(r1.respuesta)) {
    console.error('FAIL regresión resumen vacío:', r1.respuesta);
    process.exit(1);
  }

  // 2. Carrito realmente vacío → cartEmpty, nunca resumen en blanco
  const r2 = await flujoCarrito(
    ctxBase({
      llamarHerramienta: async (n) =>
        n === 'cart.get' ? { items: [], subtotal: 0, deliveryCost: 0, total: 0 } : null,
    }),
  );
  sinFiller(r2, 'vacío');
  if (!/vac[ií]o|no tienes/i.test(r2.respuesta)) {
    console.error('FAIL carrito vacío:', r2.respuesta);
    process.exit(1);
  }
  if (/resumen de tu compra|tu carrito:/i.test(r2.respuesta)) {
    console.error('FAIL carrito vacío muestra resumen en blanco:', r2.respuesta);
    process.exit(1);
  }

  // 3. "1" en cart NO es selección de producto → muestra resumen + opciones
  const r3 = await flujoCarrito(ctxBase({ mensaje: '1', msj: '1', intencion: 'numero' }));
  sinFiller(r3, 'numero');
  if (!/papel grueso/i.test(r3.respuesta) || !/confirmar pedido/i.test(r3.respuesta)) {
    console.error('FAIL numero en cart:', r3.respuesta);
    process.exit(1);
  }

  // 4. confirmar pedido con dirección guardada → checkout_address con confirmación
  const r4 = await flujoCarrito(
    ctxBase({ mensaje: 'confirmar pedido', msj: 'confirmar pedido', intencion: 'confirmar' }),
  );
  sinFiller(r4, 'confirmar');
  if (r4.parche.phase !== 'checkout_address' || !/av\. lima 123/i.test(r4.respuesta)) {
    console.error('FAIL confirmar:', r4.respuesta, r4.parche);
    process.exit(1);
  }

  // 5. confirmar con carrito vacío → cartEmpty, sin checkout
  const r5 = await flujoCarrito(
    ctxBase({
      mensaje: 'confirmar pedido',
      msj: 'confirmar pedido',
      intencion: 'confirmar',
      llamarHerramienta: async (n) =>
        n === 'cart.get' ? { items: [], subtotal: 0, deliveryCost: 0, total: 0 } : null,
    }),
  );
  if (r5.parche.phase && /^checkout/.test(r5.parche.phase)) {
    console.error('FAIL confirmar vacío pasa a checkout:', r5.parche);
    process.exit(1);
  }
  if (!/vac[ií]o|no tienes/i.test(r5.respuesta)) {
    console.error('FAIL confirmar vacío:', r5.respuesta);
    process.exit(1);
  }

  console.log('OK carrito');
})();
