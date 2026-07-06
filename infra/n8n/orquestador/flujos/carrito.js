/**
 * Flujo Carrito — fase `cart`.
 * NO interpreta dígitos como selección de producto.
 * Siempre consulta cart.get para tener el carrito fresco (nunca el de la sesión).
 */

async function flujoCarrito(ctx) {
  const { msj, intencion, sesion, claveEstado, copys, llamarHerramienta } = ctx;
  const { COPY, unir, claves } = prepararCopys(copys, sesion);
  const flujo = { ...(sesion.flow || {}) };
  const cliente = sesion.customer || { found: false };

  const carritoFresco = await llamarHerramienta('cart.get', { stateKey: claveEstado });
  const carrito = carritoFresco?.items ? carritoFresco : sesion.cart || { items: [], total: 0 };

  if (intencion === 'confirmar' || /confirmar pedido|finalizar/.test(msj)) {
    if (!carrito.items?.length) {
      return {
        respuesta: unir(COPY.cartEmpty()),
        parche: { lastCopyKeys: { ...claves } },
      };
    }
    const checkout = flujo.checkout || {};
    let fase;
    let respuesta;
    if (cliente.found && cliente.address) {
      fase = 'checkout_address';
      checkout.useSavedAddress = true;
      respuesta = unir(COPY.checkoutConfirmSavedAddress(cliente.address));
    } else if (!cliente.found || !cliente.name) {
      fase = 'checkout_name';
      respuesta = unir(COPY.checkoutAskName());
    } else {
      fase = 'checkout_address';
      respuesta = unir(COPY.checkoutAskAddress());
    }
    return { respuesta, parche: { phase: fase, checkout, lastCopyKeys: { ...claves } } };
  }

  if (!carrito.items?.length) {
    return {
      respuesta: unir(COPY.cartEmpty()),
      parche: { lastCopyKeys: { ...claves } },
    };
  }

  const respuesta =
    unir(COPY.cartSummary()) +
    '\n' +
    resumenCarrito(carrito) +
    '\n\nDi *confirmar pedido* para finalizar o *catálogo* para seguir comprando.';
  return { respuesta, parche: { lastCopyKeys: { ...claves } } };
}

if (typeof module !== 'undefined') {
  Object.assign(global, require('../nucleo/intencion.js'));
  Object.assign(global, require('../nucleo/productos.js'));
  Object.assign(global, require('../nucleo/copys.js'));
  module.exports = { flujoCarrito };
}
