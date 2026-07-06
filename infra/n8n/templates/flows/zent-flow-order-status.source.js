const STATUS_ES = {
  NUEVO: 'Recibido',
  EN_GESTION: 'En preparación',
  CONFIRMADO: 'Confirmado',
  EN_DELIVERY: 'En camino',
  COMPLETADO: 'Entregado',
  CANCELADO: 'Cancelado',
};

function handleOrderStatusFlow(ctx) {
  const { message, flow, toolResults, toolCalls, contactPhone } = ctx;
  const h = ctx.helpers;
  const { COPY, mergeKeys } = h;
  const handoff = false;
  let reply = '';

  if (looksLikeOrderId(message)) {
    const id = message.replace(/^#/, '').trim();
    toolCalls.push({ name: 'orders.get_status', body: { orderId: id, customerPhone: contactPhone } });
    if (toolResults['orders.get_status']) {
      const o = toolResults['orders.get_status'];
      reply = mergeKeys(COPY.orderStatus(STATUS_ES[o.status] || o.status, o.shortId));
    } else if (toolResults['orders.get_status'] === null) {
      reply = mergeKeys(COPY.orderNotFound());
    } else {
      reply = mergeKeys(COPY.lookupFiller());
    }
  } else {
    toolCalls.push({ name: 'orders.find_active_by_phone', body: { customerPhone: contactPhone } });
    if (toolResults['orders.find_active_by_phone']?.found) {
      const o = toolResults['orders.find_active_by_phone'].order;
      reply = mergeKeys(COPY.orderStatus(STATUS_ES[o.status] || o.status, o.shortId));
    } else if (toolResults['orders.find_active_by_phone']) {
      reply = mergeKeys(COPY.noActiveOrder());
    } else {
      reply = mergeKeys(COPY.lookupFiller());
    }
  }
  flow.phase = 'main_menu';
  const patch = { phase: 'main_menu', lastCopyKeys: { ...ctx.keysRef } };
  return { reply, nextPhase: flow.phase, handoff, toolCalls, patch };
}

function handleHandoffFlow(ctx) {
  const { flow, toolCalls, stateKey, chatId, contactPhone, waSessionId } = ctx;
  const h = ctx.helpers;
  const { COPY, mergeKeys } = h;
  toolCalls.push({
    name: 'chat.handoff',
    body: { chatId: stateKey || chatId, contactPhone, waSessionId },
  });
  const reply = mergeKeys(COPY.handoff());
  flow.phase = 'handoff';
  return {
    reply,
    nextPhase: 'handoff',
    handoff: true,
    toolCalls,
    patch: { phase: 'handoff', lastCopyKeys: { ...ctx.keysRef } },
  };
}

if (typeof module !== 'undefined') {
  module.exports = { handleOrderStatusFlow, handleHandoffFlow, STATUS_ES };
}
