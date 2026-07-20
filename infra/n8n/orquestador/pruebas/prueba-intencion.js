const { normalizarMensaje, detectarIntencion, esSaludo, esAfirmativo, pareceIdPedido } = require('../nucleo/intencion.js');

const casos = [
  ['hola', 'saludo'],
  ['Hola!', 'saludo'],
  ['buenas tardes', 'saludo'],
  ['1', 'numero'],
  ['15', 'numero'],
  ['si', 'confirmar'],
  ['confirmar pedido', 'confirmar'],
  ['confirmo', 'confirmar'],
  ['no', 'negar'],
  ['catalogo', 'catalogo'],
  ['Catálogo', 'catalogo'],
  ['ver productos', 'catalogo'],
  ['catálogo pdf', 'catalogo_pdf'],
  ['catalogo completo', 'catalogo_pdf'],
  ['Puedes enviarme el catálogo actualizado', 'catalogo_pdf'],
  ['Puede enviarme el catálogo?', 'catalogo_pdf'],
  ['mándame el catálogo', 'catalogo_pdf'],
  ['pásame el catálogo por favor', 'catalogo_pdf'],
  ['quiero ver el catálogo', 'catalogo'],
  ['mi carrito', 'carrito'],
  ['donde esta mi pedido', 'estado_pedido'],
  ['estado de mi compra', 'estado_pedido'],
  ['quiero hablar con un asesor', 'asesor'],
  ['menu', 'reinicio'],
  ['inicio', 'reinicio'],
  ['quiero papel bond tamano A4', 'libre'],
];

for (const [msj, esperado] of casos) {
  const got = detectarIntencion(normalizarMensaje(msj));
  if (got !== esperado) {
    console.error(`FAIL intencion "${msj}": esperado ${esperado}, got ${got}`);
    process.exit(1);
  }
}

if (esSaludo('1')) {
  console.error('FAIL: "1" no es saludo');
  process.exit(1);
}
if (!esSaludo('hola')) {
  console.error('FAIL: "hola" es saludo');
  process.exit(1);
}
if (!esAfirmativo('si')) {
  console.error('FAIL: "si" es afirmativo');
  process.exit(1);
}
if (esAfirmativo('sizzling')) {
  console.error('FAIL: "sizzling" no es afirmativo');
  process.exit(1);
}
if (!pareceIdPedido('abc12345')) {
  console.error('FAIL: "abc12345" parece id de pedido');
  process.exit(1);
}

console.log('OK intencion');
