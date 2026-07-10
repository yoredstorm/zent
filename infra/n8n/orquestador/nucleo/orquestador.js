/**
 * Punto de entrada ÚNICO del orquestador (nodo "Orquestar" en n8n).
 *
 * Reemplaza el pipeline de varios nodos (Preparar Contexto → Switch → 6 flujos →
 * Guardar) por una sola función con red de seguridad: contexto → flujo → guardar
 * sesión → responder, todo envuelto en try/catch.
 *
 * GARANTÍAS:
 *   - NUNCA lanza. Siempre devuelve { reply, handoff, metadata, media }.
 *   - Si el flujo falla, NO cambia la fase (el usuario reintenta el mismo paso,
 *     nunca queda atascado) y responde algo útil ofreciendo asesor.
 *
 * Es también el punto que ejercitan las pruebas, así el test corre el MISMO
 * código que producción.
 */

async function orquestarMensaje(cuerpo, helpers) {
  const RESPALDO =
    'No te entendí bien 😅 Escribe *menú* para ver las opciones, *catálogo* para ver productos o *asesor* para hablar con una persona.';

  let datos;
  try {
    datos = prepararContexto(cuerpo);
  } catch (e) {
    console.log('ERROR orquestador contexto: ' + (e && e.message ? e.message : e));
    return { reply: RESPALDO, handoff: false, metadata: { error: 'contexto' }, media: [] };
  }

  const FLUJOS = {
    menu: flujoMenu,
    catalogo: flujoCatalogo,
    carrito: flujoCarrito,
    checkout: flujoCheckout,
    pedido: flujoPedido,
    asesor: flujoAsesor,
  };

  try {
    const ejecutor = crearEjecutor({ datos, helpers, copys: copysZent() });
    const flujo = FLUJOS[datos.grupo] || FLUJOS.menu;
    return await ejecutor.ejecutarYResponder(flujo);
  } catch (e) {
    console.log(
      'ERROR orquestador flujo ' + (datos && datos.grupo) + ': ' + (e && e.message ? e.message : e),
    );
    return {
      reply: RESPALDO,
      handoff: false,
      metadata: { phase: datos && datos.fase, grupo: datos && datos.grupo, error: 'flujo' },
      media: [],
    };
  }
}

if (typeof module !== 'undefined') {
  Object.assign(global, require('./enrutador.js'));
  Object.assign(global, require('./ejecutor.js'));
  Object.assign(global, require('../textos.js'));
  Object.assign(global, require('../flujos/menu.js'));
  Object.assign(global, require('../flujos/catalogo.js'));
  Object.assign(global, require('../flujos/carrito.js'));
  Object.assign(global, require('../flujos/checkout.js'));
  Object.assign(global, require('../flujos/pedido.js'));
  Object.assign(global, require('../flujos/asesor.js'));
  module.exports = { orquestarMensaje };
}
