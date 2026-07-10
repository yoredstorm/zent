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
  // OJO: usar `null`, nunca `undefined` — el parche viaja por HTTP como JSON hacia
  // `chat.session.patch` (helpers.httpRequest serializa el body), y JSON.stringify
  // DESCARTA las claves con valor `undefined`. Si se usara `undefined` aquí, el
  // backend nunca recibiría la instrucción de "borrar" el campo y el valor viejo
  // quedaría pegado en la sesión para siempre (bug real ya visto en producción).
  return {
    phase: 'main_menu',
    checkout: {},
    categoryId: null,
    categoryName: null,
    lastProductList: null,
    selectedProductId: null,
    productPage: null,
    esperandoVariante: null,
    varianteSeleccionada: null,
    lastCopyKeys: { ...claves },
  };
}

if (typeof module !== 'undefined') {
  module.exports = { prepararCopys, textoBienvenida, parcheBienvenida };
}
