/** Núcleo de productos — búsqueda difusa y formatos de listas, detalle y carrito. */

function buscarCategoria(texto, categorias) {
  const n = normalizarMensaje(texto);
  const porNumero = parseInt(n, 10);
  if (!isNaN(porNumero) && porNumero >= 1 && porNumero <= categorias.length) {
    return categorias[porNumero - 1];
  }
  return (
    categorias.find(
      (c) => normalizarMensaje(c.name).includes(n) || n.includes(normalizarMensaje(c.name)),
    ) || null
  );
}

/** Selección por número o nombre para *ver* un producto (sin cantidad). */
function elegirProducto(texto, lista) {
  if (!lista?.length) return null;
  const msj = normalizarMensaje(texto);
  if (/^\d+$/.test(msj)) {
    const idx = parseInt(msj, 10);
    if (idx >= 1 && idx <= lista.length) return lista[idx - 1];
    return null;
  }
  return (
    lista.find(
      (p) => normalizarMensaje(p.name).includes(msj) || msj.includes(normalizarMensaje(p.name)),
    ) || null
  );
}

/** "agregar 2 reglas" → { producto, cantidad } */
function buscarProductoConCantidad(texto, lista) {
  if (!lista?.length) return null;
  const msj = normalizarMensaje(texto).replace(/^(agrega(r)?|anade|anadir|pon(me)?|quiero)\s+/, '');
  const m = msj.match(/(\d+)\s*(.+)?/);
  let cantidad = 1;
  let resto = msj;
  if (m) {
    cantidad = parseInt(m[1], 10) || 1;
    resto = (m[2] || '').trim();
  }
  if (/^\d+$/.test(msj) && lista.length === 1) {
    return { producto: lista[0], cantidad: parseInt(msj, 10) || 1 };
  }
  const porNumero = parseInt(resto || '', 10);
  if (resto && !isNaN(porNumero) && porNumero >= 1 && porNumero <= lista.length && !resto.match(/[a-z]/)) {
    return { producto: lista[porNumero - 1], cantidad };
  }
  if (/primero|1ro/.test(msj)) return { producto: lista[0], cantidad };
  if (/segundo|2do/.test(msj)) return { producto: lista[1], cantidad };
  if (!resto && lista.length === 1) return { producto: lista[0], cantidad };
  if (resto) {
    const hallado = lista.find(
      (p) => normalizarMensaje(p.name).includes(resto) || resto.includes(normalizarMensaje(p.name)),
    );
    if (hallado) return { producto: hallado, cantidad };
  }
  return null;
}

function esAgregarDirecto(texto) {
  const msj = normalizarMensaje(texto);
  return /^(agrega(r)?|anade|anadir|pon(me)?|quiero)\s+/.test(msj) || /^\d+\s+[a-z]/.test(msj);
}

function leerCantidad(texto) {
  const msj = normalizarMensaje(texto).replace(/^(agrega(r)?|anade|anadir|pon(me)?|quiero)\s+/, '');
  if (/^\d+$/.test(msj)) return parseInt(msj, 10) || 0;
  const m = msj.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) || 0 : 0;
}

function tecla(n) {
  const teclas = { 1: '1️⃣', 2: '2️⃣', 3: '3️⃣', 4: '4️⃣', 5: '5️⃣', 6: '6️⃣', 7: '7️⃣', 8: '8️⃣', 9: '9️⃣', 10: '🔟' };
  return teclas[n] ?? `${n}.`;
}

function listaProductos(productos, pagina = 0, porPagina = 8) {
  const corte = productos.slice(pagina * porPagina, (pagina + 1) * porPagina);
  const lineas = corte.map((p, i) => {
    const idx = pagina * porPagina + i + 1;
    const nombre = p.lowStock ? `*${p.name}*` : p.name;
    return `${tecla(idx)} ${nombre} — S/ ${Number(p.price).toFixed(2)}`;
  });
  const hayMas = productos.length > (pagina + 1) * porPagina;
  return { texto: lineas.join('\n'), hayMas, pagina };
}

/**
 * El backend manda los atributos como una sola línea "Marca: Faber · Peso: 2 kg".
 * Con 1 solo atributo se ve bien en una línea; con varios, apretarlos con "·" se
 * vuelve ilegible — aquí se abren en viñetas, una por atributo.
 */
function formatearAtributos(atributos, opts = {}) {
  if (!atributos) return '';
  const { maxItems = 5 } = opts;
  const partes = atributos
    .split('·')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, maxItems);
  if (!partes.length) return '';
  if (partes.length === 1) return `📋 ${partes[0]}`;
  return '📋 *Detalles:*\n' + partes.map((p) => `   ▫️ ${p}`).join('\n');
}

function detalleProducto(producto, opts = {}) {
  const { sinEncabezado = false } = opts;
  let texto = sinEncabezado
    ? ''
    : `*${producto.name}*\n💰 Precio: S/ ${Number(producto.price).toFixed(2)}`;
  if (producto.description?.trim()) {
    texto += (texto ? '\n' : '') + `📝 ${producto.description.trim()}`;
  }
  const atributosFmt = formatearAtributos(producto.atributos);
  if (atributosFmt) texto += (texto ? '\n' : '') + atributosFmt;
  if (producto.lowStock) texto += '\n⚠️ *¡Quedan pocas unidades!*';
  return texto;
}

function leyendaImagen(producto) {
  let leyenda = `*${producto.name}*\n💰 S/ ${Number(producto.price).toFixed(2)}`;
  if (producto.description?.trim()) {
    const desc = producto.description.trim();
    leyenda += `\n📝 ${desc.length > 120 ? desc.slice(0, 117) + '…' : desc}`;
  }
  const atributosFmt = formatearAtributos(producto.atributos, { maxItems: 3 });
  if (atributosFmt) leyenda += `\n${atributosFmt}`;
  if (producto.lowStock) leyenda += '\n⚠️ *¡Quedan pocas unidades!*';
  return leyenda;
}

const DIVISOR_CARRITO = '┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄';

/** Resumen de carrito estilo recibo: divisores + ítems + subtotal/envío/total. */
function resumenCarrito(carrito, opts = {}) {
  if (!carrito?.items?.length) return '';
  const { numerar = false } = opts;
  const lineas = carrito.items.map(
    (i, idx) =>
      `${numerar ? tecla(idx + 1) + ' ' : '▫️ '}${i.quantity}x ${i.nombre} — S/ ${(i.quantity * i.unitPrice).toFixed(2)}`,
  );
  const bloque = [DIVISOR_CARRITO, ...lineas, DIVISOR_CARRITO];
  bloque.push(`Subtotal: S/ ${Number(carrito.subtotal).toFixed(2)}`);
  if (carrito.deliveryCost > 0) bloque.push(`Envío: S/ ${Number(carrito.deliveryCost).toFixed(2)}`);
  bloque.push(`*Total: S/ ${Number(carrito.total).toFixed(2)}*`);
  return bloque.join('\n');
}

if (typeof module !== 'undefined') {
  Object.assign(global, require('./intencion.js'));
  module.exports = {
    buscarCategoria,
    elegirProducto,
    buscarProductoConCantidad,
    esAgregarDirecto,
    leerCantidad,
    tecla,
    listaProductos,
    formatearAtributos,
    detalleProducto,
    leyendaImagen,
    resumenCarrito,
  };
}
