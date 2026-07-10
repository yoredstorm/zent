/** Flujo Asesor — traspaso a humano; el bot queda en pausa. */

async function flujoAsesor(ctx) {
  const { sesion, entrada, claveEstado, copys, llamarHerramienta } = ctx;
  const { COPY, unir, claves } = prepararCopys(copys, sesion);

  // Ya está en manos de un asesor: no re-disparar el handoff ni spamear el copy
  // en cada mensaje. Respuesta vacía → el bridge no envía nada mientras el bot está en pausa.
  if (sesion.flow?.phase === 'handoff') {
    return { respuesta: '', parche: { phase: 'handoff', lastCopyKeys: { ...claves } } };
  }

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
