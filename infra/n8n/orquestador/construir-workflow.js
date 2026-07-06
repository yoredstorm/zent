/**
 * Constructor del workflow "Zent Orquestador WhatsApp".
 * Genera zent-orquestador.workflow.json con nodos visibles por flujo:
 *   Entrada WhatsApp → Preparar Contexto → Enrutador de Fase (Switch)
 *     → Flujo Menú / Catálogo / Carrito / Checkout / Pedido / Asesor
 *     → Guardar Sesión y Responder → Responder a Zent
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

const copys = limpiarExports(leer('../templates/zent-copy-variants.source.js'));
const nucleo = ['nucleo/intencion.js', 'nucleo/productos.js', 'nucleo/copys.js', 'nucleo/sesion.js']
  .map((f) => limpiarExports(leer(f)))
  .join('\n');

// ---------------------------------------------------------------------------
// Código del nodo "Preparar Contexto"
// ---------------------------------------------------------------------------
const codigoPrepararContexto = `${limpiarExports(leer('nucleo/intencion.js'))}

const entrada = $json.body ?? $json;
const contexto = entrada.context ?? {};
const sesion = contexto.session ?? {};
const mensaje = String(entrada.message ?? entrada.text ?? '').trim();
const msj = normalizarMensaje(mensaje);
const intencion = detectarIntencion(msj);
const fase = sesion.flow?.phase || 'greeting';

const FASES_CHECKOUT = ['checkout_name', 'checkout_address', 'checkout_reference', 'checkout_confirm'];
const GRUPO_POR_FASE = {
  greeting: 'menu', main_menu: 'menu',
  browse_categories: 'catalogo', browse_products: 'catalogo', product_detail: 'catalogo',
  cart: 'carrito',
  checkout_name: 'checkout', checkout_address: 'checkout', checkout_reference: 'checkout', checkout_confirm: 'checkout',
  order_status: 'pedido', handoff: 'asesor',
};

const enCheckout = FASES_CHECKOUT.includes(fase);
let grupo;
if (intencion === 'asesor' || fase === 'handoff') grupo = 'asesor';
else if (!enCheckout && (intencion === 'reinicio' || intencion === 'saludo')) grupo = 'menu';
else if (!enCheckout && intencion === 'catalogo_pdf') grupo = 'menu';
else if (!enCheckout && intencion === 'catalogo') grupo = 'catalogo';
else if (!enCheckout && intencion === 'estado_pedido') grupo = 'pedido';
else if (!enCheckout && intencion === 'carrito') grupo = 'carrito';
else if (!enCheckout && /confirmar|finalizar|checkout/.test(msj)) grupo = 'carrito';
else grupo = GRUPO_POR_FASE[fase] || 'menu';

const claveEstado = contexto.stateKey || (entrada.waSessionId ? entrada.waSessionId + '::' + entrada.chatId : entrada.chatId);

return [{ json: {
  grupo, fase, mensaje, msj, intencion, sesion,
  entrada: { chatId: entrada.chatId, waSessionId: entrada.waSessionId, contactPhone: entrada.contactPhone },
  claveEstado,
  apiUrl: contexto.zentApiUrl || 'http://backend-api:3000/api',
  secreto: contexto.zentN8nSecret || '',
} }];
`;

// ---------------------------------------------------------------------------
// Pegamento común de cada nodo de flujo
// ---------------------------------------------------------------------------
function codigoNodoFlujo(archivoFlujo, nombreFuncion) {
  return `${copys}
${nucleo}
${limpiarExports(leer(archivoFlujo))}

const d = $json;
const copysLib = { pick, pickAvoidRepeat, timeGreeting, buildCopy };
const self = this;
async function llamarHerramienta(nombre, cuerpo) {
  try {
    return await self.helpers.httpRequest({
      method: 'POST',
      url: d.apiUrl + '/webhooks/n8n/tools/' + nombre,
      headers: { Authorization: 'Bearer ' + d.secreto, 'Content-Type': 'application/json' },
      body: cuerpo,
      json: true,
    });
  } catch (e) {
    console.log('AVISO herramienta ' + nombre + ' fallo: ' + (e.message || e));
    return null;
  }
}

const resultado = await ${nombreFuncion}({
  mensaje: d.mensaje,
  msj: d.msj,
  intencion: d.intencion,
  sesion: d.sesion,
  entrada: d.entrada,
  claveEstado: d.claveEstado,
  copys: copysLib,
  llamarHerramienta,
});

return [{ json: { ...d, ...resultado } }];
`;
}

// ---------------------------------------------------------------------------
// Código del nodo "Guardar Sesión y Responder"
// ---------------------------------------------------------------------------
const codigoGuardarResponder = `const d = $json;
const self = this;
if (d.parche && Object.keys(d.parche).length) {
  try {
    await self.helpers.httpRequest({
      method: 'POST',
      url: d.apiUrl + '/webhooks/n8n/tools/chat.session.patch',
      headers: { Authorization: 'Bearer ' + d.secreto, 'Content-Type': 'application/json' },
      body: { chatId: d.claveEstado, flow: d.parche },
      json: true,
    });
  } catch (e) {
    console.log('AVISO: chat.session.patch fallo: ' + (e.message || e));
  }
}
return [{ json: {
  reply: d.respuesta || '',
  handoff: Boolean(d.traspaso),
  metadata: { phase: (d.parche && d.parche.phase) || d.fase },
  media: d.media || [],
} }];
`;

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
  if (nodo.parameters.jsCode && /module\.exports/.test(nodo.parameters.jsCode)) {
    console.error(`ERROR: el nodo "${nodo.name}" contiene module.exports sin limpiar`);
    process.exit(1);
  }
}

fs.writeFileSync(path.join(dir, 'zent-orquestador.workflow.json'), json);
console.log('Escrito zent-orquestador.workflow.json');
