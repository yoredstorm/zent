/**
 * Núcleo ejecutor — encapsula el "pegamento" común de todos los nodos de flujo:
 * llamar herramientas del backend, armar el contexto del flujo y guardar la sesión.
 * Así el código editable de cada nodo n8n queda en 2-3 líneas.
 */

function crearEjecutor({ datos, helpers, copys }) {
  async function llamarHerramienta(nombre, cuerpo) {
    try {
      return await helpers.httpRequest({
        method: 'POST',
        url: datos.apiUrl + '/webhooks/n8n/tools/' + nombre,
        headers: {
          Authorization: 'Bearer ' + datos.secreto,
          'Content-Type': 'application/json',
        },
        body: cuerpo,
        json: true,
      });
    } catch (e) {
      console.log('AVISO herramienta ' + nombre + ' fallo: ' + (e.message || e));
      return null;
    }
  }

  /** Ejecuta un flujo (flujoMenu, flujoCatalogo, …) y devuelve datos + resultado. */
  async function ejecutar(flujo) {
    const resultado = await flujo({
      mensaje: datos.mensaje,
      msj: datos.msj,
      intencion: datos.intencion,
      sesion: datos.sesion,
      entrada: datos.entrada,
      claveEstado: datos.claveEstado,
      copys,
      llamarHerramienta,
    });
    return { ...datos, ...resultado };
  }

  /**
   * Modo "n8n + IA": redacta el reply final con IA a partir de `datosIA` (hechos
   * ya calculados por el flujo). NUNCA decide — solo parafrasea. Si el flujo no
   * expuso `datosIA`, o la IA falla/no está disponible, se conserva el texto
   * canon (`estado.respuesta`) sin romper el turno (fail-soft, igual que
   * `llamarHerramienta`).
   */
  async function redactarConIA(estado) {
    if (!datos.aiHybrid || !estado.datosIA) return estado.respuesta || '';
    const compuesta = await llamarHerramienta('ai.compose_reply', {
      datosIA: estado.datosIA,
      mensajeUsuario: datos.mensaje,
      fase: (estado.parche && estado.parche.phase) || datos.fase,
      cliente: datos.sesion.customer,
    });
    return compuesta?.reply || estado.respuesta || '';
  }

  /** Persiste el parche de sesión y arma la respuesta para el bridge de Zent. */
  async function guardarYResponder() {
    if (datos.parche && Object.keys(datos.parche).length) {
      await llamarHerramienta('chat.session.patch', {
        chatId: datos.claveEstado,
        flow: datos.parche,
      });
    }
    return {
      reply: await redactarConIA(datos),
      handoff: Boolean(datos.traspaso),
      metadata: { phase: (datos.parche && datos.parche.phase) || datos.fase },
      media: datos.media || [],
    };
  }

  /**
   * Corre el flujo, persiste su parche y arma la respuesta — todo en un paso.
   * Es el punto usado por el nodo único (Orquestar): un solo turno, sin nodos intermedios.
   */
  async function ejecutarYResponder(flujo) {
    const resultado = await flujo({
      mensaje: datos.mensaje,
      msj: datos.msj,
      intencion: datos.intencion,
      sesion: datos.sesion,
      entrada: datos.entrada,
      claveEstado: datos.claveEstado,
      copys,
      llamarHerramienta,
    });
    const estado = { ...datos, ...resultado };
    if (estado.parche && Object.keys(estado.parche).length) {
      await llamarHerramienta('chat.session.patch', {
        chatId: datos.claveEstado,
        flow: estado.parche,
      });
    }
    return {
      reply: await redactarConIA(estado),
      handoff: Boolean(estado.traspaso),
      metadata: {
        phase: (estado.parche && estado.parche.phase) || datos.fase,
        grupo: datos.grupo,
      },
      media: estado.media || [],
    };
  }

  return { llamarHerramienta, ejecutar, guardarYResponder, ejecutarYResponder };
}

/** Los copys viven como funciones sueltas en el scope del nodo; aquí se empaquetan. */
function copysZent() {
  return { pick, pickAvoidRepeat, timeGreeting, buildCopy };
}

if (typeof module !== 'undefined') {
  module.exports = { crearEjecutor, copysZent };
}
