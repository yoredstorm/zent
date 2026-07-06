/** Núcleo de copys — manejo de variantes anti-repetición y bienvenida compartida. */

function prepararCopys(copys, sesion) {
  const claves = { ...(sesion?.flow?.lastCopyKeys || {}) };
  const COPY = copys.buildCopy(claves);
  function unir(r) {
    if (r?.lastCopyKeys) Object.assign(claves, r.lastCopyKeys);
    return r?.text || '';
  }
  return { COPY, unir, claves };
}

function textoBienvenida({ sesion, copys, COPY, unir }) {
  const cliente = sesion.customer || { found: false };
  const tienda = sesion.storeName || 'Zent';
  const tg = copys.timeGreeting(sesion.localHour);
  const gr = cliente.found
    ? cliente.isReturning
      ? COPY.greetingReturning(cliente.name, tienda, cliente.totalOrders)
      : COPY.greetingNamed(cliente.name, tienda, tg)
    : COPY.greetingAnonymous(tienda, tg);
  return unir(gr) + '\n\n' + unir(COPY.mainMenu());
}

function parcheBienvenida(claves) {
  return {
    phase: 'main_menu',
    checkout: {},
    categoryId: undefined,
    categoryName: undefined,
    lastProductList: undefined,
    selectedProductId: undefined,
    productPage: undefined,
    esperandoVariante: undefined,
    varianteSeleccionada: undefined,
    lastCopyKeys: { ...claves },
  };
}

if (typeof module !== 'undefined') {
  module.exports = { prepararCopys, textoBienvenida, parcheBienvenida };
}
