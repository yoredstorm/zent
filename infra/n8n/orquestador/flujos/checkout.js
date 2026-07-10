/**
 * Flujo Checkout — checkout_name, checkout_address, checkout_reference, checkout_confirm.
 * "si" es confirmación (nunca se guarda como dirección). No interpreta dígitos.
 */

async function flujoCheckout(ctx) {
  const { mensaje, msj, intencion, sesion, entrada, claveEstado, copys, llamarHerramienta } = ctx;
  const { COPY, unir, claves } = prepararCopys(copys, sesion);
  const flujo = { ...(sesion.flow || {}) };
  const cliente = sesion.customer || { found: false };
  const checkout = { ...(flujo.checkout || {}) };

  function confirmacionFinal(carrito) {
    const direccion = checkout.address || cliente.address || '';
    const referencia = checkout.reference || cliente.reference || '';
    const respuesta =
      unir(COPY.checkoutSummaryIntro()) +
      '\n\n' +
      resumenCarrito(carrito) +
      '\n📍 ' +
      direccion +
      (referencia ? '\n📌 ' + referencia : '') +
      '\n\nResponde *sí* o *confirmo* para registrar el pedido.';
    return {
      respuesta,
      parche: { phase: 'checkout_confirm', checkout, lastCopyKeys: { ...claves } },
    };
  }

  async function trasResolverDireccion() {
    checkout.address = checkout.address || cliente.address || '';
    const carritoFresco = await llamarHerramienta('cart.get', { stateKey: claveEstado });
    const carrito = carritoFresco?.items ? carritoFresco : sesion.cart || { items: [] };
    if (checkout.useSavedAddress) {
      checkout.reference = checkout.reference || cliente.reference || '';
      return confirmacionFinal(carrito);
    }
    if (cliente.reference?.trim() && !checkout.reference) {
      checkout.reference = cliente.reference.trim();
      return confirmacionFinal(carrito);
    }
    return {
      respuesta: unir(COPY.checkoutAskReference()),
      parche: { phase: 'checkout_reference', checkout, lastCopyKeys: { ...claves } },
    };
  }

  switch (flujo.phase) {
    case 'checkout_name': {
      checkout.customerName = mensaje.trim();
      if (cliente.found && cliente.address) {
        checkout.useSavedAddress = true;
        return {
          respuesta: unir(COPY.checkoutConfirmSavedAddress(cliente.address)),
          parche: { phase: 'checkout_address', checkout, lastCopyKeys: { ...claves } },
        };
      }
      return {
        respuesta: unir(COPY.checkoutAskAddress()),
        parche: { phase: 'checkout_address', checkout, lastCopyKeys: { ...claves } },
      };
    }

    case 'checkout_address': {
      if (/cambiar/.test(msj)) {
        checkout.useSavedAddress = false;
        checkout.address = undefined;
        return {
          respuesta: unir(COPY.checkoutAskAddress()),
          parche: { phase: 'checkout_address', checkout, lastCopyKeys: { ...claves } },
        };
      }
      if (esAfirmativo(msj) && cliente.address) {
        checkout.useSavedAddress = true;
        checkout.address = cliente.address;
        return trasResolverDireccion();
      }
      if (!esAfirmativo(msj) && mensaje.trim().length > 2) {
        checkout.address = mensaje.trim();
        checkout.useSavedAddress = false;
        return trasResolverDireccion();
      }
      if (cliente.found && cliente.address) {
        checkout.useSavedAddress = true;
        return {
          respuesta: unir(COPY.checkoutConfirmSavedAddress(cliente.address)),
          parche: { phase: 'checkout_address', checkout, lastCopyKeys: { ...claves } },
        };
      }
      return {
        respuesta: unir(COPY.checkoutAskAddress()),
        parche: { phase: 'checkout_address', checkout, lastCopyKeys: { ...claves } },
      };
    }

    case 'checkout_reference': {
      if (!/^no$|^nop|^ninguna|^-$/.test(msj)) {
        checkout.reference = mensaje.trim();
      }
      const carritoFresco = await llamarHerramienta('cart.get', { stateKey: claveEstado });
      const carrito = carritoFresco?.items ? carritoFresco : sesion.cart || { items: [] };
      return confirmacionFinal(carrito);
    }

    case 'checkout_confirm': {
      const carritoFresco = await llamarHerramienta('cart.get', { stateKey: claveEstado });
      const carrito = carritoFresco?.items ? carritoFresco : sesion.cart || { items: [] };

      if (intencion === 'confirmar' || esAfirmativo(msj)) {
        if (!carrito.items?.length) {
          // Guard anti-duplicado: si ya se creó un pedido y el carrito quedó vacío,
          // no volver a crear — solo confirmar que ya está registrado.
          if (flujo.lastOrderId) {
            return {
              respuesta:
                `Tu pedido *#${String(flujo.lastOrderId).slice(0, 8)}* ya quedó registrado ✅\n\n` +
                unir(COPY.goodbyeSoft()),
              parche: { phase: 'main_menu', checkout: {}, lastCopyKeys: { ...claves } },
            };
          }
          return {
            respuesta: unir(COPY.cartEmpty()),
            parche: { phase: 'main_menu', checkout: {}, lastCopyKeys: { ...claves } },
          };
        }
        const nombre = checkout.customerName || (cliente.found ? cliente.name : 'Cliente');
        const direccion = checkout.address || cliente.address || '';
        const referencia = checkout.reference || cliente.reference || '';
        const pedido = await llamarHerramienta('orders.create_from_chat', {
          chatId: entrada.chatId,
          waSessionId: entrada.waSessionId,
          customerName: nombre,
          customerPhone: entrada.contactPhone,
          address: direccion,
          reference: referencia,
          items: carrito.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            variantId: i.variantId || undefined,
          })),
        });
        if (!pedido?.orderId) {
          return {
            respuesta:
              'No pude registrar el pedido en este momento 😔 Escribe *sí* para intentar de nuevo o *asesor* para que te atienda una persona.',
            parche: { phase: 'checkout_confirm', checkout, lastCopyKeys: { ...claves } },
          };
        }
        await llamarHerramienta('cart.clear', { stateKey: claveEstado });
        const respuesta =
          unir(COPY.orderConfirmed(pedido.orderId)) + '\n\n' + unir(COPY.goodbyeSoft());
        return {
          respuesta,
          parche: {
            phase: 'main_menu',
            checkout: {},
            lastOrderId: pedido.orderId,
            lastCopyKeys: { ...claves },
          },
        };
      }

      if (intencion === 'negar') {
        return {
          respuesta:
            'Sin problema, no registré el pedido. Tu carrito sigue guardado — di *catálogo* para seguir o *confirmar pedido* cuando estés listo.',
          parche: { phase: 'cart', lastCopyKeys: { ...claves } },
        };
      }

      return confirmacionFinal(carrito);
    }

    default:
      return {
        respuesta: unir(COPY.didntUnderstand()),
        parche: { phase: 'main_menu', lastCopyKeys: { ...claves } },
      };
  }
}

if (typeof module !== 'undefined') {
  Object.assign(global, require('../nucleo/intencion.js'));
  Object.assign(global, require('../nucleo/productos.js'));
  Object.assign(global, require('../nucleo/copys.js'));
  module.exports = { flujoCheckout };
}
