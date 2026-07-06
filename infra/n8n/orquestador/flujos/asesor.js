/** Flujo Asesor — traspaso a humano; el bot queda en pausa. */

async function flujoAsesor(ctx) {
  const { sesion, entrada, claveEstado, copys, llamarHerramienta } = ctx;
  const { COPY, unir, claves } = prepararCopys(copys, sesion);

  await llamarHerramienta('chat.handoff', {
    chatId: claveEstado || entrada.chatId,
    contactPhone: entrada.contactPhone,
    waSessionId: entrada.waSessionId,
  });

  return {
    respuesta: unir(COPY.handoff()),
    traspaso: true,
    parche: { phase: 'handoff', lastCopyKeys: { ...claves } },
  };
}

if (typeof module !== 'undefined') {
  Object.assign(global, require('../nucleo/copys.js'));
  module.exports = { flujoAsesor };
}
