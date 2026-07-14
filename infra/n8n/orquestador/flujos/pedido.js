/** Flujo Pedido — pide el código, muestra detalle con antigüedad y ofrece asesor. */

const ESTADOS_ES = {
  NUEVO: 'Recibido',
  EN_GESTION: 'En preparación',
  CONFIRMADO: 'Confirmado',
  EN_DELIVERY: 'En camino',
  COMPLETADO: 'Entregado',
  CANCELADO: 'Cancelado',
};
const EMOJI_ESTADO = {
  NUEVO: '📥',
  EN_GESTION: '👨‍🍳',
  CONFIRMADO: '✅',
  EN_DELIVERY: '🚚',
  COMPLETADO: '📦',
  CANCELADO: '❌',
};

const DIVISOR_PEDIDO = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';

function pedidoParaIA(o) {
  const fechaRef = o.updatedAt || o.createdAt;
  return {
    codigo: o.shortId,
    estado: ESTADOS_ES[o.status] || o.status,
    antiguedad: fechaRef ? haceCuanto(fechaRef) : null,
    items: (o.items || []).map((it) => ({
      nombre: it.productName,
      cantidad: it.quantity,
      opcion: it.variantLabel || null,
    })),
  };
}

function textoDetallePedido(o, unir, COPY) {
  const fechaRef = o.updatedAt || o.createdAt;
  const antiguedad = fechaRef ? haceCuanto(fechaRef) : '';
  const lineas = [
    `${EMOJI_ESTADO[o.status] || '📦'} Pedido *#${o.shortId}*: *${ESTADOS_ES[o.status] || o.status}*` +
      (antiguedad ? ` (${antiguedad})` : ''),
  ];
  if (o.items?.length) {
    lineas.push(DIVISOR_PEDIDO);
    for (const it of o.items) {
      lineas.push(`▫️ ${it.quantity}x ${it.productName}` + (it.variantLabel ? ` — _${it.variantLabel}_` : ''));
    }
    lineas.push(DIVISOR_PEDIDO);
  }
  lineas.push('', unir(COPY.orderDetailFooter()));
  return lineas.join('\n');
}

async function flujoPedido(ctx) {
  const { mensaje, msj, sesion, entrada, copys, llamarHerramienta } = ctx;
  const { COPY, unir, claves } = prepararCopys(copys, sesion);
  const flujo = sesion.flow || {};

  async function buscarPorTelefono() {
    const r = await llamarHerramienta('orders.find_active_by_phone', {
      customerPhone: entrada.contactPhone,
    });
    if (r?.found) {
      return {
        respuesta: textoDetallePedido(r.order, unir, COPY),
        datosIA: { tipo: 'estado_pedido', pedido: pedidoParaIA(r.order) },
        parche: { phase: 'main_menu', esperandoCodigo: null, lastCopyKeys: { ...claves } },
      };
    }
    return {
      respuesta: unir(COPY.noActiveOrder()),
      parche: { phase: 'main_menu', esperandoCodigo: null, lastCopyKeys: { ...claves } },
    };
  }

  // Ya estamos esperando el código
  if (flujo.phase === 'order_status' && flujo.esperandoCodigo) {
    if (/^no( tengo| lo tengo| se)?$/.test(msj)) return buscarPorTelefono();
    if (pareceIdPedido(mensaje)) {
      const id = mensaje.replace(/^#/, '').trim();
      const r = await llamarHerramienta('orders.get_status', {
        orderId: id,
        customerPhone: entrada.contactPhone,
      });
      if (r?.status) {
        return {
          respuesta: textoDetallePedido(r, unir, COPY),
          datosIA: { tipo: 'estado_pedido', pedido: pedidoParaIA(r) },
          parche: { phase: 'main_menu', esperandoCodigo: null, lastCopyKeys: { ...claves } },
        };
      }
      return {
        respuesta: unir(COPY.orderNotFound()),
        parche: { lastCopyKeys: { ...claves } }, // sigue esperando código
      };
    }
    return buscarPorTelefono();
  }

  // Si el mensaje YA trae un código, no preguntamos dos veces
  if (pareceIdPedido(mensaje)) {
    const id = mensaje.replace(/^#/, '').trim();
    const r = await llamarHerramienta('orders.get_status', {
      orderId: id,
      customerPhone: entrada.contactPhone,
    });
    if (r?.status) {
      return {
        respuesta: textoDetallePedido(r, unir, COPY),
        datosIA: { tipo: 'estado_pedido', pedido: pedidoParaIA(r) },
        parche: { phase: 'main_menu', lastCopyKeys: { ...claves } },
      };
    }
  }

  // Entrada al flujo: pedir el código
  return {
    respuesta: unir(COPY.orderAskCode()),
    parche: { phase: 'order_status', esperandoCodigo: true, lastCopyKeys: { ...claves } },
  };
}

if (typeof module !== 'undefined') {
  Object.assign(global, require('../nucleo/intencion.js'));
  Object.assign(global, require('../nucleo/copys.js'));
  Object.assign(global, require('../nucleo/tiempo.js'));
  module.exports = { flujoPedido, ESTADOS_ES, textoDetallePedido };
}
