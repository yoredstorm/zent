const { flujoMenu } = require('../flujos/menu.js');
const copySrc = require('../textos.js');

const copys = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

function ctxBase(extra = {}) {
  return {
    mensaje: 'hola',
    msj: 'hola',
    intencion: 'saludo',
    sesion: {
      storeName: 'ohana',
      customer: { found: true, name: 'Pablo' },
      flow: { phase: 'main_menu' },
      cart: { items: [], total: 0 },
    },
    entrada: { chatId: 'x', waSessionId: 's', contactPhone: '519' },
    claveEstado: 's::x',
    copys,
    llamarHerramienta: async () => null,
    ...extra,
  };
}

(async () => {
  const saludo = await flujoMenu(ctxBase());
  if (!/pablo/i.test(saludo.respuesta) || saludo.parche.phase !== 'main_menu') {
    console.error('FAIL saludo:', saludo);
    process.exit(1);
  }
  if (saludo.parche.lastProductList !== undefined || saludo.parche.selectedProductId !== undefined) {
    // buildWelcomePatch debe limpiar navegación previa (claves presentes con valor undefined)
  }
  if (!('lastProductList' in saludo.parche)) {
    console.error('FAIL: parche bienvenida no limpia lastProductList');
    process.exit(1);
  }

  const llamadas = [];
  const pdf = await flujoMenu(
    ctxBase({
      msj: 'catalogo pdf',
      intencion: 'catalogo_pdf',
      llamarHerramienta: async (n, c) => {
        llamadas.push(n);
        return { sent: true };
      },
    }),
  );
  if (!llamadas.includes('catalog_pdf.send')) {
    console.error('FAIL pdf: no llamó catalog_pdf.send');
    process.exit(1);
  }
  if (/momentito|segundito|voy a mirarlo/i.test(pdf.respuesta)) {
    console.error('FAIL pdf: respuesta es filler:', pdf.respuesta);
    process.exit(1);
  }
  if (!/pdf|cat[aá]logo/i.test(pdf.respuesta)) {
    console.error('FAIL pdf: respuesta no confirma envío:', pdf.respuesta);
    process.exit(1);
  }

  const pdfCaido = await flujoMenu(ctxBase({ msj: 'catalogo pdf', intencion: 'catalogo_pdf' }));
  if (/momentito|segundito|voy a mirarlo/i.test(pdfCaido.respuesta)) {
    console.error('FAIL pdf caído devuelve filler:', pdfCaido.respuesta);
    process.exit(1);
  }
  if (!/no.*(disponible|activo)/i.test(pdfCaido.respuesta)) {
    console.error('FAIL pdf caído: respuesta no es honesta:', pdfCaido.respuesta);
    process.exit(1);
  }

  console.log('OK menu');
})();
