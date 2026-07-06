/** Flujo Pedido — consulta de estado por código o por teléfono. */

const ESTADOS_ES = {
  NUEVO: 'Recibido',
  EN_GESTION: 'En preparación',
  CONFIRMADO: 'Confirmado',
  EN_DELIVERY: 'En camino',
  COMPLETADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

async function flujoPedido(ctx) {
  const { mensaje, sesion, entrada, copys, llamarHerramienta } = ctx;
  const { COPY, unir, claves } = prepararCopys(copys, sesion);

  let respuesta;
  if (pareceIdPedido(mensaje)) {
    const id = mensaje.replace(/^#/, '').trim();
    const r = await llamarHerramienta('orders.get_status', {
      orderId: id,
      customerPhone: entrada.contactPhone,
    });
    respuesta = r?.status
      ? unir(COPY.orderStatus(ESTADOS_ES[r.status] || r.status, r.shortId))
      : unir(COPY.orderNotFound());
  } else {
    const r = await llamarHerramienta('orders.find_active_by_phone', {
      customerPhone: entrada.contactPhone,
    });
    if (r?.found) {
      const o = r.order;
      respuesta = unir(COPY.orderStatus(ESTADOS_ES[o.status] || o.status, o.shortId));
    } else {
      respuesta = unir(COPY.noActiveOrder());
    }
  }

  return { respuesta, parche: { phase: 'main_menu', lastCopyKeys: { ...claves } } };
}

if (typeof module !== 'undefined') {
  Object.assign(global, require('../nucleo/intencion.js'));
  Object.assign(global, require('../nucleo/copys.js'));
  module.exports = { flujoPedido, ESTADOS_ES };
}
