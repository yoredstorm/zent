/**
 * Prueba del modo "n8n + IA": el nodo Orquestar debe redactar con IA SOLO
 * cuando `aiHybrid` está activo y el flujo expuso `datosIA`; en cualquier
 * otro caso (aiHybrid apagado, sin datosIA, o la IA falla) debe conservar
 * el texto canon del flujo — nunca romper el turno (fail-soft).
 */
const { crearEjecutor } = require('../nucleo/ejecutor.js');

function datosBase(extra = {}) {
  return {
    mensaje: 'hola',
    msj: 'hola',
    intencion: 'saludo',
    sesion: { customer: { found: true, name: 'Pablo' } },
    entrada: { chatId: 'x', waSessionId: 's', contactPhone: '519' },
    claveEstado: 's::x',
    fase: 'greeting',
    grupo: 'menu',
    aiHybrid: false,
    ...extra,
  };
}

const flujoConDatosIA = async () => ({
  respuesta: 'Texto canon de la plantilla',
  datosIA: { tipo: 'saludo', cliente: { found: true, name: 'Pablo' } },
  parche: { phase: 'main_menu' },
});

const flujoSinDatosIA = async () => ({
  respuesta: 'Texto canon sin datosIA',
  parche: { phase: 'main_menu' },
});

function crearHelpersConIA(respuestaIA) {
  const llamadas = [];
  return {
    llamadas,
    helpers: {
      async httpRequest({ url, body }) {
        const nombre = url.split('/tools/')[1];
        llamadas.push(nombre);
        if (nombre === 'ai.compose_reply') return respuestaIA;
        if (nombre === 'chat.session.patch') return { flow: body.flow };
        return null;
      },
    },
  };
}

(async () => {
  // 1. aiHybrid apagado + datosIA presente → se conserva el texto canon, sin llamar a la IA
  {
    const { helpers, llamadas } = crearHelpersConIA({ reply: 'NO debería usarse' });
    const ejecutor = crearEjecutor({ datos: datosBase({ aiHybrid: false }), helpers, copys: {} });
    const r = await ejecutor.ejecutarYResponder(flujoConDatosIA);
    if (r.reply !== 'Texto canon de la plantilla') {
      console.error('FAIL 1: debía conservar el texto canon con aiHybrid apagado:', r.reply);
      process.exit(1);
    }
    if (llamadas.includes('ai.compose_reply')) {
      console.error('FAIL 1: no debía llamar a ai.compose_reply con aiHybrid apagado');
      process.exit(1);
    }
  }

  // 2. aiHybrid activo + datosIA + IA responde → se usa el reply de la IA
  {
    const { helpers, llamadas } = crearHelpersConIA({ reply: 'Hola Pablo, qué gusto verte de nuevo 😊' });
    const ejecutor = crearEjecutor({ datos: datosBase({ aiHybrid: true }), helpers, copys: {} });
    const r = await ejecutor.ejecutarYResponder(flujoConDatosIA);
    if (r.reply !== 'Hola Pablo, qué gusto verte de nuevo 😊') {
      console.error('FAIL 2: debía usar el reply de la IA:', r.reply);
      process.exit(1);
    }
    if (!llamadas.includes('ai.compose_reply')) {
      console.error('FAIL 2: debía llamar a ai.compose_reply');
      process.exit(1);
    }
  }

  // 3. aiHybrid activo + datosIA + la IA falla (null) → fail-soft: conserva el canon
  {
    const { helpers } = crearHelpersConIA(null);
    const ejecutor = crearEjecutor({ datos: datosBase({ aiHybrid: true }), helpers, copys: {} });
    const r = await ejecutor.ejecutarYResponder(flujoConDatosIA);
    if (r.reply !== 'Texto canon de la plantilla') {
      console.error('FAIL 3: debía caer al texto canon si la IA falla:', r.reply);
      process.exit(1);
    }
  }

  // 4. aiHybrid activo pero el flujo NO expuso datosIA → no llama a la IA, usa el canon
  {
    const { helpers, llamadas } = crearHelpersConIA({ reply: 'NO debería usarse' });
    const ejecutor = crearEjecutor({ datos: datosBase({ aiHybrid: true }), helpers, copys: {} });
    const r = await ejecutor.ejecutarYResponder(flujoSinDatosIA);
    if (r.reply !== 'Texto canon sin datosIA') {
      console.error('FAIL 4: sin datosIA debía conservar el canon:', r.reply);
      process.exit(1);
    }
    if (llamadas.includes('ai.compose_reply')) {
      console.error('FAIL 4: no debía llamar a ai.compose_reply sin datosIA');
      process.exit(1);
    }
  }

  console.log('OK hibrido-ia');
})();
