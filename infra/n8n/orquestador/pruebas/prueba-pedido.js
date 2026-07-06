const { flujoPedido } = require('../flujos/pedido.js');
const copySrc = require('../textos.js');

const copys = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

const hace2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const pedidoEnCamino = {
  status: 'EN_DELIVERY',
  shortId: '9375c821',
  updatedAt: hace2h,
  createdAt: ayer,
  items: [{ productName: 'Polo', quantity: 2, variantLabel: 'Rojo / M' }],
};

function ctxBase(extra = {}) {
  return {
    mensaje: 'mi pedido',
    msj: 'mi pedido',
    intencion: 'estado_pedido',
    sesion: {
      storeName: 'ohana',
      customer: { found: true, name: 'Pablo' },
      flow: { phase: 'main_menu' },
    },
    entrada: { chatId: 'x', waSessionId: 's', contactPhone: '519' },
    claveEstado: 's::x',
    copys,
    llamarHerramienta: async () => null,
    ...extra,
  };
}

(async () => {
  // 1. "mi pedido" → pide el código y pasa a order_status esperando código
  const r1 = await flujoPedido(ctxBase());
  if (!/c[oó]digo/i.test(r1.respuesta)) {
    console.error('FAIL pedir código:', r1.respuesta);
    process.exit(1);
  }
  if (r1.parche.phase !== 'order_status' || r1.parche.esperandoCodigo !== true) {
    console.error('FAIL parche pedir código:', r1.parche);
    process.exit(1);
  }

  // 2. Código válido → detalle rico: estado, antigüedad, items con variante y pie de asesor
  const llamadas = [];
  const r2 = await flujoPedido(
    ctxBase({
      mensaje: '9375c821',
      msj: '9375c821',
      intencion: 'libre',
      sesion: {
        storeName: 'ohana',
        customer: { found: true, name: 'Pablo' },
        flow: { phase: 'order_status', esperandoCodigo: true },
      },
      llamarHerramienta: async (n, args) => {
        llamadas.push([n, args]);
        return n === 'orders.get_status' ? pedidoEnCamino : null;
      },
    }),
  );
  if (llamadas[0]?.[0] !== 'orders.get_status') {
    console.error('FAIL no llamó get_status:', llamadas);
    process.exit(1);
  }
  for (const esperado of [/En camino/i, /hace 2 horas/, /2x Polo/, /Rojo \/ M/, /asesor/i]) {
    if (!esperado.test(r2.respuesta)) {
      console.error(`FAIL detalle no contiene ${esperado}:`, r2.respuesta);
      process.exit(1);
    }
  }
  if (r2.parche.phase !== 'main_menu') {
    console.error('FAIL detalle no vuelve a main_menu:', r2.parche);
    process.exit(1);
  }

  // 3. Pedido cancelado → estado Cancelado + ofrece asesor
  const r3 = await flujoPedido(
    ctxBase({
      mensaje: '9375c821',
      msj: '9375c821',
      intencion: 'libre',
      sesion: {
        storeName: 'ohana',
        customer: { found: true, name: 'Pablo' },
        flow: { phase: 'order_status', esperandoCodigo: true },
      },
      llamarHerramienta: async (n) =>
        n === 'orders.get_status' ? { ...pedidoEnCamino, status: 'CANCELADO' } : null,
    }),
  );
  if (!/Cancelado/i.test(r3.respuesta) || !/asesor/i.test(r3.respuesta)) {
    console.error('FAIL cancelado:', r3.respuesta);
    process.exit(1);
  }

  // 4a. "no tengo" → busca por teléfono y muestra detalle si hay pedido activo
  const r4a = await flujoPedido(
    ctxBase({
      mensaje: 'no tengo',
      msj: 'no tengo',
      intencion: 'libre',
      sesion: {
        storeName: 'ohana',
        customer: { found: true, name: 'Pablo' },
        flow: { phase: 'order_status', esperandoCodigo: true },
      },
      llamarHerramienta: async (n) =>
        n === 'orders.find_active_by_phone' ? { found: true, order: pedidoEnCamino } : null,
    }),
  );
  if (!/En camino/i.test(r4a.respuesta) || !/hace 2 horas/.test(r4a.respuesta)) {
    console.error('FAIL no tengo (encontrado):', r4a.respuesta);
    process.exit(1);
  }

  // 4b. "no tengo" sin pedidos activos → noActiveOrder, sin colgarse
  const r4b = await flujoPedido(
    ctxBase({
      mensaje: 'no tengo',
      msj: 'no tengo',
      intencion: 'libre',
      sesion: {
        storeName: 'ohana',
        customer: { found: true, name: 'Pablo' },
        flow: { phase: 'order_status', esperandoCodigo: true },
      },
      llamarHerramienta: async (n) =>
        n === 'orders.find_active_by_phone' ? { found: false } : null,
    }),
  );
  if (!/no tienes pedidos|no veo compras|no hay pedidos/i.test(r4b.respuesta)) {
    console.error('FAIL no tengo (sin pedidos):', r4b.respuesta);
    process.exit(1);
  }
  if (r4b.parche.phase !== 'main_menu') {
    console.error('FAIL no tengo (sin pedidos) parche:', r4b.parche);
    process.exit(1);
  }

  // 5. Código inexistente → orderNotFound y sigue esperando otro código
  const r5 = await flujoPedido(
    ctxBase({
      mensaje: 'deadbeef',
      msj: 'deadbeef',
      intencion: 'libre',
      sesion: {
        storeName: 'ohana',
        customer: { found: true, name: 'Pablo' },
        flow: { phase: 'order_status', esperandoCodigo: true },
      },
      llamarHerramienta: async (n) => (n === 'orders.get_status' ? null : null),
    }),
  );
  if (!/no encontr|no aparece|no ubico/i.test(r5.respuesta)) {
    console.error('FAIL código inexistente:', r5.respuesta);
    process.exit(1);
  }
  // El parche no debe sacarlo del flujo (el merge de sesión conserva esperandoCodigo)
  if (r5.parche.phase === 'main_menu') {
    console.error('FAIL código inexistente sale del flujo:', r5.parche);
    process.exit(1);
  }

  // 6. Código directo desde el menú (sin pedir dos veces) → detalle inmediato
  const r6 = await flujoPedido(
    ctxBase({
      mensaje: '9375c821',
      msj: '9375c821',
      intencion: 'libre',
      llamarHerramienta: async (n) => (n === 'orders.get_status' ? pedidoEnCamino : null),
    }),
  );
  if (!/En camino/i.test(r6.respuesta) || !/9375c821/.test(r6.respuesta)) {
    console.error('FAIL código directo:', r6.respuesta);
    process.exit(1);
  }

  console.log('OK pedido');
})();
