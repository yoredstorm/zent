/**
 * Flujo Menú — saludo, menú principal y catálogo PDF.
 * Aquí NUNCA se interpretan números como selección de producto.
 */

async function flujoMenu(ctx) {
  const { intencion, sesion, entrada, copys, llamarHerramienta } = ctx;
  const { COPY, unir, claves } = prepararCopys(copys, sesion);

  if (intencion === 'catalogo_pdf') {
    const resultado = await llamarHerramienta('catalog_pdf.send', {
      chatId: entrada.chatId,
      waSessionId: entrada.waSessionId,
    });
    const respuesta = resultado?.sent
      ? unir(COPY.catalogPdfSent())
      : unir(COPY.catalogPdfUnavailable());
    return {
      respuesta,
      datosIA: { tipo: 'catalogo_pdf', enviado: Boolean(resultado?.sent) },
      parche: { phase: 'main_menu', lastCopyKeys: { ...claves } },
    };
  }

  const respuesta = textoBienvenida({ sesion, copys, COPY, unir });
  return {
    respuesta,
    datosIA: {
      tipo: 'saludo',
      storeName: sesion.storeName || 'Zent',
      cliente: sesion.customer || { found: false },
    },
    parche: parcheBienvenida(claves),
  };
}

if (typeof module !== 'undefined') {
  Object.assign(global, require('../nucleo/copys.js'));
  module.exports = { flujoMenu };
}
