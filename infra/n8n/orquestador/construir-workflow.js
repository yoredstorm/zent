/**
 * Constructor del workflow "Zent Orquestador WhatsApp".
 * Genera zent-orquestador.workflow.json con un GRAFO MÍNIMO Y ROBUSTO:
 *
 *   Entrada WhatsApp (webhook) → Orquestar (Code) → Responder a Zent
 *
 * Nota de diseño (KISS + robustez):
 *   - Un solo nodo Code ("Orquestar") hace todo: normaliza el mensaje, enruta,
 *     ejecuta el flujo correspondiente, persiste la sesión y arma la respuesta.
 *   - `orquestarMensaje` envuelve todo en try/catch: el nodo NUNCA lanza, así el
 *     webhook siempre responde y la sesión nunca queda a medias.
 *   - Los nodos Code de n8n son sandboxes aislados (no hay require ni funciones
 *     compartidas entre nodos). Por eso la librería (copys + nucleo + flujos) va
 *     embebida UNA sola vez en este nodo, marcada como GENERADA.
 *   - La ÚNICA fuente de verdad son los archivos de nucleo/ y flujos/.
 *   - La invocación va AL FINAL del nodo, después de la librería, para que todas
 *     las definiciones (incluidas const) estén inicializadas antes de ejecutarse.
 */
const fs = require('fs');
const path = require('path');

const dir = __dirname;

function leer(relativo) {
  return fs.readFileSync(path.join(dir, relativo), 'utf8');
}

function limpiarExports(codigo) {
  return codigo.replace(/^if \(typeof module !== 'undefined'\) \{[\s\S]*?\n\}/gm, '');
}

// ---------------------------------------------------------------------------
// Librería embebida (orden de carga). Todo son declaraciones de función +
// algunas const de módulo; la invocación al final garantiza que todo exista.
// ---------------------------------------------------------------------------
const ARCHIVOS_LIBRERIA = [
  'textos.js',
  'nucleo/intencion.js',
  'nucleo/enrutador.js',
  'nucleo/productos.js',
  'nucleo/copys.js',
  'nucleo/sesion.js',
  'nucleo/tiempo.js',
  'nucleo/ejecutor.js',
  'flujos/menu.js',
  'flujos/catalogo.js',
  'flujos/carrito.js',
  'flujos/checkout.js',
  'flujos/pedido.js',
  'flujos/asesor.js',
  'nucleo/orquestador.js',
];

const libreria = ARCHIVOS_LIBRERIA.map((f) => limpiarExports(leer(f))).join('\n');

const codigoOrquestar = `// ╔══════════════════════════════════════════════════════════════════════╗
// ║  ORQUESTADOR ZENT — NODO ÚNICO (GENERADO — NO EDITAR AQUÍ)            ║
// ║  Fuente de verdad: infra/n8n/orquestador/{textos,nucleo,flujos}/*.js  ║
// ║  Regenerar con: node infra/n8n/orquestador/construir-workflow.js      ║
// ╚══════════════════════════════════════════════════════════════════════╝
${libreria}

// ─── Punto de entrada (al final: toda la librería ya está inicializada) ───
return [{ json: await orquestarMensaje($json.body ?? $json, this.helpers) }];`;

// ---------------------------------------------------------------------------
// Nodos y conexiones
// ---------------------------------------------------------------------------
const nodos = [
  {
    parameters: { path: 'zent-chat', httpMethod: 'POST', responseMode: 'responseNode' },
    id: 'entrada-whatsapp',
    name: 'Entrada WhatsApp',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [-600, 300],
    webhookId: 'zent-chat-orchestrator',
  },
  {
    parameters: { jsCode: codigoOrquestar },
    id: 'orquestar',
    name: 'Orquestar',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-260, 300],
  },
  {
    parameters: {
      respondWith: 'json',
      responseBody:
        '={{ JSON.stringify({ reply: $json.reply, handoff: $json.handoff, metadata: $json.metadata, media: $json.media }) }}',
    },
    id: 'responder-a-zent',
    name: 'Responder a Zent',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [120, 300],
  },
];

const conexiones = {
  'Entrada WhatsApp': { main: [[{ node: 'Orquestar', type: 'main', index: 0 }]] },
  Orquestar: { main: [[{ node: 'Responder a Zent', type: 'main', index: 0 }]] },
};

const workflow = {
  name: 'Zent Orquestador WhatsApp',
  nodes: nodos,
  connections: conexiones,
  active: false,
  settings: { executionOrder: 'v1' },
  meta: { template: 'zent-orquestador' },
};

// Validaciones antes de escribir
const json = JSON.stringify(workflow, null, 2);
JSON.parse(json);
for (const nodo of nodos) {
  if (nodo.parameters.jsCode && /module\.exports|require\(/.test(nodo.parameters.jsCode)) {
    console.error(`ERROR: el nodo "${nodo.name}" contiene module.exports o require sin limpiar`);
    process.exit(1);
  }
}

fs.writeFileSync(path.join(dir, 'zent-orquestador.workflow.json'), json);
console.log('Escrito zent-orquestador.workflow.json (grafo: Webhook → Orquestar → Responder)');
