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

  /** Persiste el parche de sesión y arma la respuesta para el bridge de Zent. */
  async function guardarYResponder() {
    if (datos.parche && Object.keys(datos.parche).length) {
      await llamarHerramienta('chat.session.patch', {
        chatId: datos.claveEstado,
        flow: datos.parche,
      });
    }
    return {
      reply: datos.respuesta || '',
      handoff: Boolean(datos.traspaso),
      metadata: { phase: (datos.parche && datos.parche.phase) || datos.fase },
      media: datos.media || [],
    };
  }

  return { llamarHerramienta, ejecutar, guardarYResponder };
}

/** Los copys viven como funciones sueltas en el scope del nodo; aquí se empaquetan. */
function copysZent() {
  return { pick, pickAvoidRepeat, timeGreeting, buildCopy };
}

if (typeof module !== 'undefined') {
  module.exports = { crearEjecutor };
}
