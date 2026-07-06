const { flujoCheckout } = require('../flujos/checkout.js');
const copySrc = require('../../templates/zent-copy-variants.source.js');

const copys = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

const carrito = {
  items: [{ productId: 'p1', nombre: 'papel grueso', quantity: 5, unitPrice: 50 }],
  subtotal: 250,
  deliveryCost: 0,
  total: 250,
};

function ctxBase(extra = {}) {
  return {
    mensaje: 'si',
    msj: 'si',
    intencion: 'confirmar',
    sesion: {
      storeName: 'ohana',
      customer: { found: true, name: 'Pablo', address: 'Av. Lima 123', reference: 'portón azul' },
      flow: { phase: 'checkout_confirm', checkout: { useSavedAddress: true, address: 'Av. Lima 123' } },
      cart: carrito,
      cartTtlMinutes: 30,
    },
    entrada: { chatId: 'x', waSessionId: 's', contactPhone: '519' },
    claveEstado: 's::x',
    copys,
    llamarHerramienta: async (n) => (n === 'cart.get' ? carrito : null),
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
  // 1. "si" en checkout_confirm → crea pedido + limpia carrito + confirma con id real
  const llamadas1 = [];
  const r1 = await flujoCheckout(
    ctxBase({
      llamarHerramienta: async (n, c) => {
        llamadas1.push([n, c]);
        if (n === 'cart.get') return carrito;
        if (n === 'orders.create_from_chat') return { orderId: 'abcd1234-5678', shortId: 'abcd1234' };
        if (n === 'cart.clear') return { ok: true };
        return null;
      },
    }),
  );
  sinFiller(r1, 'confirmar');
  if (!llamadas1.some(([n]) => n === 'orders.create_from_chat')) {
    console.error('FAIL: no creó pedido', llamadas1.map(([n]) => n));
    process.exit(1);
  }
  if (!llamadas1.some(([n]) => n === 'cart.clear')) {
    console.error('FAIL: no limpió carrito');
    process.exit(1);
  }
  if (!/abcd1234/i.test(r1.respuesta) || r1.parche.phase !== 'main_menu') {
    console.error('FAIL confirmación:', r1.respuesta, r1.parche);
    process.exit(1);
  }

  // 2. "Si" en checkout_address con dirección guardada → usa la dirección, NUNCA la guarda como texto
  const r2 = await flujoCheckout(
    ctxBase({
      mensaje: 'Si',
      msj: 'si',
      sesion: {
        storeName: 'ohana',
        customer: { found: true, name: 'Pablo', address: 'Av. Lima 123', reference: 'portón azul' },
        flow: { phase: 'checkout_address', checkout: { useSavedAddress: true } },
        cart: carrito,
        cartTtlMinutes: 30,
      },
    }),
  );
  sinFiller(r2, 'direccion si');
  if (r2.parche.checkout?.address !== 'Av. Lima 123') {
    console.error('FAIL: "Si" no usó la dirección guardada:', r2.parche.checkout);
    process.exit(1);
  }
  if (/📍 si\b/i.test(r2.respuesta)) {
    console.error('FAIL: "Si" quedó como dirección:', r2.respuesta);
    process.exit(1);
  }
  if (r2.parche.phase !== 'checkout_confirm') {
    console.error('FAIL: con referencia guardada debe saltar a confirmar:', r2.parche.phase);
    process.exit(1);
  }

  // 3. Dirección nueva + referencia guardada → salta a confirmar sin pedir referencia
  const r3 = await flujoCheckout(
    ctxBase({
      mensaje: 'Jr. Cusco 456, San Isidro',
      msj: 'jr cusco 456 san isidro',
      intencion: 'libre',
      sesion: {
        storeName: 'ohana',
        customer: { found: true, name: 'Pablo', address: 'Av. Lima 123', reference: 'portón azul' },
        flow: { phase: 'checkout_address', checkout: {} },
        cart: carrito,
        cartTtlMinutes: 30,
      },
    }),
  );
  sinFiller(r3, 'direccion nueva');
  if (r3.parche.checkout?.address !== 'Jr. Cusco 456, San Isidro') {
    console.error('FAIL: dirección nueva no guardada:', r3.parche.checkout);
    process.exit(1);
  }
  if (r3.parche.phase !== 'checkout_confirm') {
    console.error('FAIL: debía saltar a confirmar (referencia guardada):', r3.parche.phase);
    process.exit(1);
  }

  // 4. orders.create_from_chat falla → respuesta honesta, fase reintentable
  const r4 = await flujoCheckout(
    ctxBase({
      llamarHerramienta: async (n) => (n === 'cart.get' ? carrito : null),
    }),
  );
  sinFiller(r4, 'pedido fallido');
  if (!/no pude registrar/i.test(r4.respuesta) || r4.parche.phase !== 'checkout_confirm') {
    console.error('FAIL pedido fallido:', r4.respuesta, r4.parche);
    process.exit(1);
  }

  // 5. "no" en checkout_confirm → vuelve al carrito sin crear pedido
  const r5 = await flujoCheckout(ctxBase({ mensaje: 'no', msj: 'no', intencion: 'negar' }));
  sinFiller(r5, 'negar');
  if (r5.parche.phase !== 'cart' || !/no registr/i.test(r5.respuesta)) {
    console.error('FAIL negar:', r5.respuesta, r5.parche);
    process.exit(1);
  }

  console.log('OK checkout');
})();
