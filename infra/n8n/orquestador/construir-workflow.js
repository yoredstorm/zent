/**
 * Constructor del workflow "Zent Orquestador WhatsApp".
 * Genera zent-orquestador.workflow.json con nodos visibles por flujo:
 *   Entrada WhatsApp → Preparar Contexto → Enrutador de Fase (Switch)
 *     → Flujo Menú / Catálogo / Carrito / Checkout / Pedido / Asesor
 *     → Guardar Sesión y Responder → Responder a Zent
 *
 * Nota de diseño (KISS): los nodos Code de n8n son entornos aislados — no pueden
 * compartir funciones entre sí ni hacer require de archivos externos. Por eso cada
 * nodo lleva embebida la librería compartida (copys + nucleo), pero:
 *   - La lógica editable de cada nodo son 2-3 líneas al inicio.
 *   - La librería va al final, marcada como GENERADA (se regenera con este script).
 *   - La única fuente de verdad son los archivos de nucleo/ y flujos/.
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

const SEPARADOR = `
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  LIBRERÍA COMPARTIDA (GENERADA — NO EDITAR AQUÍ)                      ║
// ║  Fuente: infra/n8n/orquestador/{nucleo,flujos}/*.js                   ║
// ║  Regenerar con: node infra/n8n/orquestador/construir-workflow.js      ║
// ╚══════════════════════════════════════════════════════════════════════╝
`;

const libreriaComun = [
  'textos.js',
  'nucleo/intencion.js',
  'nucleo/productos.js',
  'nucleo/copys.js',
  'nucleo/sesion.js',
  'nucleo/tiempo.js',
  'nucleo/ejecutor.js',
]
  .map((f) => limpiarExports(leer(f)))
  .join('\n');

// ---------------------------------------------------------------------------
// Nodo "Preparar Contexto" — solo enrutador + intención (no necesita copys)
// ---------------------------------------------------------------------------
const codigoPrepararContexto = `// Normaliza el mensaje, detecta la intención y decide el grupo de flujo.
return [{ json: prepararContexto($json.body ?? $json) }];
${SEPARADOR}
${limpiarExports(leer('nucleo/intencion.js'))}
${limpiarExports(leer('nucleo/enrutador.js'))}`;

// ---------------------------------------------------------------------------
// Nodos de flujo — 3 líneas editables + flujo propio + librería común
// ---------------------------------------------------------------------------
function codigoNodoFlujo(archivoFlujo, nombreFuncion) {
  return `// Ejecuta ${nombreFuncion} con las herramientas del backend (await directo, sin fillers).
const ejecutor = crearEjecutor({ datos: $json, helpers: this.helpers, copys: copysZent() });
return [{ json: await ejecutor.ejecutar(${nombreFuncion}) }];

// ─── Lógica de este flujo ───
${limpiarExports(leer(archivoFlujo))}
${SEPARADOR}
${libreriaComun}`;
}

// ---------------------------------------------------------------------------
// Nodo "Guardar Sesión y Responder"
// ---------------------------------------------------------------------------
const codigoGuardarResponder = `// Persiste el parche de sesión (chat.session.patch) y arma la respuesta al bridge.
const ejecutor = crearEjecutor({ datos: $json, helpers: this.helpers, copys: null });
return [{ json: await ejecutor.guardarYResponder() }];
${SEPARADOR}
${limpiarExports(leer('nucleo/ejecutor.js'))}`;

// ---------------------------------------------------------------------------
// Nodos y conexiones
// ---------------------------------------------------------------------------
const GRUPOS = [
  { valor: 'menu', etiqueta: 'Menú', nodo: 'Flujo Menú', archivo: 'flujos/menu.js', funcion: 'flujoMenu' },
  { valor: 'catalogo', etiqueta: 'Catálogo', nodo: 'Flujo Catálogo', archivo: 'flujos/catalogo.js', funcion: 'flujoCatalogo' },
  { valor: 'carrito', etiqueta: 'Carrito', nodo: 'Flujo Carrito', archivo: 'flujos/carrito.js', funcion: 'flujoCarrito' },
  { valor: 'checkout', etiqueta: 'Checkout', nodo: 'Flujo Checkout', archivo: 'flujos/checkout.js', funcion: 'flujoCheckout' },
  { valor: 'pedido', etiqueta: 'Pedido', nodo: 'Flujo Pedido', archivo: 'flujos/pedido.js', funcion: 'flujoPedido' },
  { valor: 'asesor', etiqueta: 'Asesor', nodo: 'Flujo Asesor', archivo: 'flujos/asesor.js', funcion: 'flujoAsesor' },
];

function reglaGrupo(valor, etiqueta) {
  return {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      combinator: 'and',
      conditions: [
        {
          leftValue: '={{ $json.grupo }}',
          rightValue: valor,
          operator: { type: 'string', operation: 'equals' },
        },
      ],
    },
    renameOutput: true,
    outputKey: etiqueta,
  };
}

const nodos = [
  {
    parameters: { path: 'zent-chat', httpMethod: 'POST', responseMode: 'responseNode' },
    id: 'entrada-whatsapp',
    name: 'Entrada WhatsApp',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [-900, 300],
    webhookId: 'zent-chat-orchestrator',
  },
  {
    parameters: { jsCode: codigoPrepararContexto },
    id: 'preparar-contexto',
    name: 'Preparar Contexto',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-620, 300],
  },
  {
    parameters: {
      rules: { values: GRUPOS.map((g) => reglaGrupo(g.valor, g.etiqueta)) },
      options: {},
    },
    id: 'enrutador-de-fase',
    name: 'Enrutador de Fase',
    type: 'n8n-nodes-base.switch',
    typeVersion: 3,
    position: [-340, 300],
  },
  ...GRUPOS.map((g, i) => ({
    parameters: { jsCode: codigoNodoFlujo(g.archivo, g.funcion) },
    id: `flujo-${g.valor}`,
    name: g.nodo,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [-40, i * 160 - 100],
  })),
  {
    parameters: { jsCode: codigoGuardarResponder },
    id: 'guardar-responder',
    name: 'Guardar Sesión y Responder',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [260, 300],
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
    position: [540, 300],
  },
];

const conexiones = {
  'Entrada WhatsApp': { main: [[{ node: 'Preparar Contexto', type: 'main', index: 0 }]] },
  'Preparar Contexto': { main: [[{ node: 'Enrutador de Fase', type: 'main', index: 0 }]] },
  'Enrutador de Fase': {
    main: GRUPOS.map((g) => [{ node: g.nodo, type: 'main', index: 0 }]),
  },
  'Guardar Sesión y Responder': {
    main: [[{ node: 'Responder a Zent', type: 'main', index: 0 }]],
  },
};
for (const g of GRUPOS) {
  conexiones[g.nodo] = { main: [[{ node: 'Guardar Sesión y Responder', type: 'main', index: 0 }]] };
}

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
console.log('Escrito zent-orquestador.workflow.json');
