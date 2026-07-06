/** Núcleo de sesión — aplica un parche de flujo sobre la sesión inmutablemente. */

function aplicarParche(sesion, parche) {
  if (!parche || !Object.keys(parche).length) return sesion;
  const flujoPrevio = sesion.flow || {};
  const flujoNuevo = { ...flujoPrevio, ...parche };
  if (parche.checkout || flujoPrevio.checkout) {
    flujoNuevo.checkout = { ...(flujoPrevio.checkout || {}), ...(parche.checkout || {}) };
  }
  return { ...sesion, flow: flujoNuevo };
}

if (typeof module !== 'undefined') {
  module.exports = { aplicarParche };
}
