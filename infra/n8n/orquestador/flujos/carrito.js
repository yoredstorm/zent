/**
 * Flujo Carrito — fase `cart`.
 * NO interpreta dígitos como selección de producto.
 * Siempre consulta cart.get para tener el carrito fresco (nunca el de la sesión).
 */

function carritoParaIA(carrito) {
  return {
    items: (carrito.items || []).map((i) => ({ nombre: i.nombre, cantidad: i.quantity })),
    total: carrito.total,
  };
}

async function flujoCarrito(ctx) {
  const { mensaje, msj, intencion, sesion, entrada, claveEstado, copys, llamarHerramienta } = ctx;
  const { COPY, unir, claves } = prepararCopys(copys, sesion);
  const flujo = { ...(sesion.flow || {}) };
  const cliente = sesion.customer || { found: false };

  const carritoFresco = await llamarHerramienta('cart.get', { stateKey: claveEstado });
  const carrito = carritoFresco?.items ? carritoFresco : sesion.cart || { items: [], total: 0 };

  // Quitar un producto: "quita 2", "elimina la regla", "saca del carrito".
  if (esQuitar(msj)) {
    if (!carrito.items?.length) {
      return { respuesta: unir(COPY.cartEmpty()), parche: { phase: 'cart', lastCopyKeys: { ...claves } } };
    }
    const ref = referenciaQuitar(msj);
    let objetivo = null;
    if (/^\d+$/.test(ref)) {
      const idx = parseInt(ref, 10);
      if (idx >= 1 && idx <= carrito.items.length) objetivo = carrito.items[idx - 1];
    } else if (ref) {
      objetivo = carrito.items.find(
        (i) =>
          normalizarMensaje(i.nombre).includes(ref) || ref.includes(normalizarMensaje(i.nombre)),
      );
    } else if (carrito.items.length === 1) {
      objetivo = carrito.items[0];
    }
    if (!objetivo) {
      return {
        respuesta:
          unir(COPY.itemRemoveNotFound()) +
          '\n\n' +
          unir(COPY.cartSummary()) +
          '\n' +
          resumenCarrito(carrito, { numerar: true }),
        parche: { phase: 'cart', lastCopyKeys: { ...claves } },
      };
    }
    const res = await llamarHerramienta('cart.remove_item', {
      stateKey: claveEstado,
      chatId: claveEstado || entrada.chatId,
      contactPhone: entrada.contactPhone,
      productId: objetivo.productId,
    });
    const carritoAct = res?.cart ||
      (await llamarHerramienta('cart.get', { stateKey: claveEstado })) || { items: [] };
    if (!carritoAct.items?.length) {
      return {
        respuesta: unir(COPY.itemRemoved(objetivo.nombre)) + '\n\n' + unir(COPY.cartEmpty()),
        datosIA: {
          tipo: 'carrito_item_quitado',
          quitado: objetivo.nombre,
          carrito: carritoParaIA(carritoAct),
          siguientePaso: 'El carrito quedó vacío; invítalo a escribir "catálogo" para seguir comprando.',
        },
        parche: { phase: 'cart', lastCopyKeys: { ...claves } },
      };
    }
    return {
      respuesta:
        unir(COPY.itemRemoved(objetivo.nombre)) +
        '\n\n' +
        unir(COPY.cartSummary()) +
        '\n' +
        resumenCarrito(carritoAct, { numerar: true }) +
        '\n\nDi *confirmar pedido* para finalizar o *catálogo* para seguir comprando.',
      datosIA: {
        tipo: 'carrito_item_quitado',
        quitado: objetivo.nombre,
        carrito: carritoParaIA(carritoAct),
        siguientePaso: 'Escribe "confirmar pedido" para finalizar o "catálogo" para seguir comprando.',
      },
      parche: { phase: 'cart', lastCopyKeys: { ...claves } },
    };
  }

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
    let siguientePaso;
    if (cliente.found && cliente.address) {
      fase = 'checkout_address';
      checkout.useSavedAddress = true;
      respuesta = unir(COPY.checkoutConfirmSavedAddress(cliente.address));
      siguientePaso = `Pregúntale si entregamos en su dirección guardada (${cliente.address}) o si quiere darte una nueva.`;
    } else if (!cliente.found || !cliente.name) {
      fase = 'checkout_name';
      respuesta = unir(COPY.checkoutAskName());
      siguientePaso = 'Pídele el nombre para registrar el pedido.';
    } else {
      fase = 'checkout_address';
      respuesta = unir(COPY.checkoutAskAddress());
      siguientePaso = 'Pídele la dirección de entrega.';
    }
    return {
      respuesta,
      datosIA: {
        tipo: 'inicio_checkout',
        direccionGuardada: cliente.found ? cliente.address || null : null,
        carrito: carritoParaIA(carrito),
        siguientePaso,
      },
      parche: { phase: fase, checkout, lastCopyKeys: { ...claves } },
    };
  }

  if (!carrito.items?.length) {
    return {
      respuesta: unir(COPY.cartEmpty()),
      parche: { phase: 'cart', lastCopyKeys: { ...claves } },
    };
  }

  const respuesta =
    unir(COPY.cartSummary()) +
    '\n' +
    resumenCarrito(carrito, { numerar: true }) +
    '\n\nDi *confirmar pedido* para finalizar, *quita N* para quitar algo o *catálogo* para seguir comprando.';
  return {
    respuesta,
    datosIA: {
      tipo: 'resumen_carrito',
      carrito: carritoParaIA(carrito),
      siguientePaso: 'Escribe "confirmar pedido" para finalizar, "quita N" para quitar algo, o "catálogo" para seguir comprando.',
    },
    parche: { phase: 'cart', lastCopyKeys: { ...claves } },
  };
}

if (typeof module !== 'undefined') {
  Object.assign(global, require('../nucleo/intencion.js'));
  Object.assign(global, require('../nucleo/productos.js'));
  Object.assign(global, require('../nucleo/copys.js'));
  module.exports = { flujoCarrito };
}
