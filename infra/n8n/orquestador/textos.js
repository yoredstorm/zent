/** Textos del bot Zent — variantes anti-repetición por clave. */

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickAvoidRepeat(key, variants, lastKeys = {}) {
  const prev = lastKeys[key];
  const pool =
    variants.length > 1 && prev != null ? variants.filter((_, i) => i !== prev) : variants;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  const idx = variants.indexOf(chosen);
  return { text: variants[idx], lastCopyKeys: { ...lastKeys, [key]: idx } };
}

function timeGreeting(localHour) {
  const h = typeof localHour === 'number' ? localHour : new Date().getHours();
  if (h < 12) return pick(['Buenos días', 'Buen día', 'Qué tal tu mañana']);
  if (h < 19) return pick(['Buenas tardes', 'Qué tal la tarde', 'Hola']);
  return pick(['Buenas noches', 'Qué tal la noche', 'Hola']);
}

function buildCopy(lastKeys = {}) {
  const COPY = {
    greetingNamed: (name, store, tg) => {
      const r = pickAvoidRepeat(
        'greetingNamed',
        [
          `${tg}! *${name}*, qué gusto saludarte en *${store}* 😊`,
          `Hola *${name}* — gracias por escribirnos otra vez.`,
          `*${name}*, ¡hola! En *${store}* estamos para ayudarte.`,
        ],
        lastKeys,
      );
      return r;
    },
    greetingAnonymous: (store, tg) => {
      const r = pickAvoidRepeat(
        'greetingAnonymous',
        [
          `${tg}! *${store}* te saluda 😊`,
          `${tg} — gracias por escribir a *${store}*, ¿en qué te ayudamos?`,
          `¡Hola! Qué gusto tenerte por aquí. Somos *${store}*.`,
        ],
        lastKeys,
      );
      return r;
    },
    greetingReturning: (name, store, totalOrders) => {
      const r = pickAvoidRepeat(
        'greetingReturning',
        [
          `¡Qué bueno verte otra vez, *${name}*! Ya llevas *${totalOrders}* pedidos con *${store}* 🙌`,
          `*${name}*, gracias por confiar en *${store}* otra vez.`,
          `Hola de nuevo *${name}* — siempre es un gusto atenderte en *${store}*.`,
        ],
        lastKeys,
      );
      return r;
    },
    mainMenu: () =>
      pickAvoidRepeat(
        'mainMenu',
        [
          '¿En qué te ayudo?\n1️⃣ *Catálogo* — productos por categoría\n2️⃣ *Mi pedido* — estado de tu compra\n3️⃣ *Asesor* — hablar con una persona\nTambién puedes pedir el *catálogo PDF* o escribir lo que buscas.',
          'Escribe *1* (catálogo), *2* (mi pedido) o *3* (asesor) — o pídeme el *catálogo PDF*, o cuéntame qué buscas.',
          '¿Qué te gustaría hacer?\n1️⃣ Ver *catálogo* por categoría\n2️⃣ Consultar *mi pedido*\n3️⃣ Hablar con un *asesor*\nTambién puedes pedir el *catálogo PDF*.',
        ],
        lastKeys,
      ),
    catalogPdfSent: () =>
      pickAvoidRepeat(
        'catalogPdfSent',
        [
          'Aquí tienes nuestro catálogo completo en PDF 📋\n\n¿Quieres ver productos por categoría? Escribe *catálogo*.',
          'Te envío el PDF con todo el catálogo 📋\n\nSi prefieres comprar por aquí, escribe *catálogo*.',
          'Listo — catálogo completo adjunto 📋\n\nPara armar un pedido, dime *catálogo* o el producto que buscas.',
        ],
        lastKeys,
      ),
    catalogPdfUnavailable: () =>
      pickAvoidRepeat(
        'catalogPdfUnavailable',
        [
          'Por ahora no tenemos el PDF del catálogo disponible.\n\nPuedes ver productos escribiendo *catálogo*.',
          'El catálogo PDF no está activo en este momento.\n\nEscribe *catálogo* para ver productos por categoría.',
        ],
        lastKeys,
      ),
    catalogWelcome: (store) =>
      pickAvoidRepeat(
        'catalogWelcome',
        [
          `¡Claro! En *${store}* tenemos esto organizado por categoría:`,
          `¡Perfecto! Te muestro lo que hay en *${store}*:`,
          `Con gusto — así está nuestro catálogo en *${store}*:`,
        ],
        lastKeys,
      ),
    categoriesIntro: () =>
      pickAvoidRepeat(
        'categoriesIntro',
        [
          'Estas son nuestras categorías — escribe el *número* o el *nombre*:',
          'Mira lo que tenemos organizado por categoría:',
          'Elige una categoría (número o nombre):',
        ],
        lastKeys,
      ),
    productsIntro: (category) =>
      pickAvoidRepeat(
        'productsIntro',
        [
          `Estos son los productos de *${category}*:`,
          `En *${category}* tenemos:`,
          `Productos disponibles en *${category}*:`,
        ],
        lastKeys,
      ),
    productAskQuantity: () =>
      pickAvoidRepeat(
        'productAskQuantity',
        [
          '¿Cuántas unidades quieres? Escribe la *cantidad* (ej: *3*).\n*0* — volver al listado',
          'Escribe la *cantidad* que necesitas.\n*0* para ver otros productos.',
          '¿Cuántas llevas? Solo escribe un número.\n*0* — volver a la lista.',
        ],
        lastKeys,
      ),
    keepShopping: () =>
      pickAvoidRepeat(
        'keepShopping',
        [
          '¿Seguimos comprando? Escribe *catálogo* o el *número* de otro producto.\n*confirmar pedido* para cerrar la compra.',
          'Puedes seguir eligiendo productos con *catálogo* o un *número*.\nCuando estés listo: *confirmar pedido*.',
          '¿Algo más? *catálogo* para seguir comprando o *confirmar pedido* para finalizar.',
        ],
        lastKeys,
      ),
    addedToCart: (name, qty, minutes) =>
      pickAvoidRepeat(
        'addedToCart',
        [
          `Listo — agregué *${qty}x ${name}* a tu carrito.\n⏱ Reservado *${minutes} min* mientras decides.`,
          `*${name}* (${qty}) ya está en tu carrito. Tienes *${minutes} min* de reserva.`,
          `Perfecto, *${qty} ${name}* reservado(s) por *${minutes} min*.`,
        ],
        lastKeys,
      ),
    cartSummary: () =>
      pickAvoidRepeat(
        'cartSummary',
        ['🛒 *Tu carrito:*', 'Así va tu carrito:', 'Resumen de tu compra:'],
        lastKeys,
      ),
    cartEmpty: () =>
      pickAvoidRepeat(
        'cartEmpty',
        [
          'Tu carrito está vacío. Di *catálogo* para ver productos.',
          'No tienes productos en el carrito aún. ¿Vemos el *catálogo*?',
          'Carrito vacío — escribe *catálogo* para empezar.',
        ],
        lastKeys,
      ),
    checkoutAskName: () =>
      pickAvoidRepeat(
        'checkoutAskName',
        [
          'Para el envío, ¿a qué *nombre* registramos el pedido?',
          '¿Cómo te llamas? Lo usamos para la entrega.',
          'Necesito tu *nombre* para confirmar el pedido.',
        ],
        lastKeys,
      ),
    checkoutAskAddress: () =>
      pickAvoidRepeat(
        'checkoutAskAddress',
        [
          '¿Cuál es tu *dirección* de entrega?',
          'Indícame la *dirección* completa donde enviamos.',
          '¿A dónde te lo mandamos? Escribe la *dirección*.',
        ],
        lastKeys,
      ),
    checkoutAskReference: () =>
      pickAvoidRepeat(
        'checkoutAskReference',
        [
          '¿Alguna *referencia*? (ej: portón azul, piso 3) — o escribe *no* para omitir.',
          'Referencia de entrega (opcional). Escribe *no* si no aplica.',
          '¿Hay algo que ayude al repartidor a encontrarte?',
        ],
        lastKeys,
      ),
    checkoutConfirmSavedAddress: (address) =>
      pickAvoidRepeat(
        'checkoutConfirmSavedAddress',
        [
          `¿Enviamos a *${address}*?\nResponde *sí* o *cambiar*.`,
          `Ya tengo tu dirección: *${address}*. ¿La usamos? (*sí* / *cambiar*)`,
          `¿Mandamos a *${address}*? Di *sí* para confirmar o *cambiar* para otra dirección.`,
        ],
        lastKeys,
      ),
    checkoutSummaryIntro: () =>
      pickAvoidRepeat(
        'checkoutSummaryIntro',
        [
          'Revisa tu pedido antes de confirmar:',
          'Así quedaría tu pedido:',
          'Resumen final — confirma con *sí* o *confirmo*:',
        ],
        lastKeys,
      ),
    orderConfirmed: (orderId) =>
      pickAvoidRepeat(
        'orderConfirmed',
        [
          `✅ *Pedido registrado* (#${orderId.slice(0, 8)})\nTe avisaremos cuando esté en camino.`,
          `¡Listo! Tu pedido *#${orderId.slice(0, 8)}* fue recibido. Gracias por comprar con nosotros.`,
          `Pedido *#${orderId.slice(0, 8)}* creado. Cualquier duda, escríbenos.`,
        ],
        lastKeys,
      ),
    orderStatus: (statusLabel, shortId) =>
      pickAvoidRepeat(
        'orderStatus',
        [
          `Tu pedido *#${shortId}* está: *${statusLabel}*`,
          `Pedido *#${shortId}*: *${statusLabel}*`,
          `Estado del pedido *#${shortId}*: *${statusLabel}*`,
        ],
        lastKeys,
      ),
    orderAskCode: () =>
      pickAvoidRepeat(
        'orderAskCode',
        [
          'Claro, te ayudo con tu pedido 📦\n\nEscríbeme el *código* (ej: *9375c821*) o *no tengo* para buscarlo con tu número.',
          '¿Me pasas el *código* del pedido? (aparece en tu confirmación, ej: *9375c821*)\nSi no lo tienes, escribe *no tengo*.',
        ],
        lastKeys,
      ),
    orderDetailFooter: () =>
      pickAvoidRepeat(
        'orderDetailFooter',
        [
          '¿Dudas con la entrega? Escribe *asesor* y una persona lo revisa contigo.',
          'Si algo no cuadra, di *asesor* para que revisemos tu delivery.',
        ],
        lastKeys,
      ),
    orderNotFound: () =>
      pickAvoidRepeat(
        'orderNotFound',
        [
          'No encontré ese pedido. ¿Tienes el código o tu número de teléfono?',
          'Ese pedido no aparece. Prueba con el código corto o escribe *mi pedido*.',
          'Hmm, no ubico ese pedido. ¿Quieres consultar por tu teléfono?',
        ],
        lastKeys,
      ),
    noActiveOrder: () =>
      pickAvoidRepeat(
        'noActiveOrder',
        [
          'No tienes pedidos activos en este momento.',
          'No veo compras pendientes con tu número.',
          'Por ahora no hay pedidos en curso a tu nombre.',
        ],
        lastKeys,
      ),
    outOfStock: (name) =>
      pickAvoidRepeat(
        'outOfStock',
        [
          `Lo siento, *${name}* no tiene stock disponible ahora.`,
          `*${name}* está agotado por el momento.`,
          `No alcanza stock de *${name}*. ¿Quieres ver otra opción?`,
        ],
        lastKeys,
      ),
    productNotFound: () =>
      pickAvoidRepeat(
        'productNotFound',
        [
          'No encontré ese producto. ¿Puedes decirme el número o nombre?',
          'Ese producto no lo ubico. Prueba con el número de la lista.',
          'Producto no encontrado — elige uno de la lista o di *catálogo*.',
        ],
        lastKeys,
      ),
    didntUnderstand: () =>
      pickAvoidRepeat(
        'didntUnderstand',
        [
          'No me quedó claro 😅 ¿Quieres ver el *catálogo*, saber el *estado de tu pedido* o hablar con un *asesor*?',
          'Perdón, no lo pillé bien. Puedes decirme *catálogo*, *mi pedido* o *asesor*.',
          'Hmm, no entendí. ¿Te ayudo con una *compra nueva*, el *estado del pedido* o prefieres un *asesor*?',
        ],
        lastKeys,
      ),
    lookupFiller: () =>
      pickAvoidRepeat(
        'lookupFiller',
        [
          'Dame un segundito, lo reviso…',
          'Un momentito, ya te cuento.',
          'Voy a mirarlo y te respondo enseguida.',
        ],
        lastKeys,
      ),
    handoff: () =>
      pickAvoidRepeat(
        'handoff',
        [
          '👤 Te conecto con un asesor humano. Espera un momento, por favor.',
          'Un asesor te atenderá en breve. Gracias por tu paciencia.',
          'Listo — alguien del equipo te escribirá pronto.',
        ],
        lastKeys,
      ),
    goodbyeSoft: () =>
      pickAvoidRepeat(
        'goodbyeSoft',
        [
          'Si necesitas algo más, aquí estoy 😊',
          'Cualquier cosa, escríbenos cuando quieras.',
          'Gracias por tu compra — ¡hasta pronto!',
        ],
        lastKeys,
      ),
    paginationMore: () =>
      pickAvoidRepeat(
        'paginationMore',
        [
          'Hay más productos — escribe *más* para ver el resto.',
          '¿Te muestro más? Escribe *más*.',
          'Escribe *más* para la siguiente página.',
        ],
        lastKeys,
      ),
    noMoreProducts: () =>
      pickAvoidRepeat(
        'noMoreProducts',
        [
          'Eso es todo por aquí 🙂 Escribe el *número* de un producto o *catálogo* para ver otras categorías.',
          'No hay más productos en esta lista. Elige uno por su *número* o di *catálogo*.',
        ],
        lastKeys,
      ),
    searchResultsIntro: (query) =>
      pickAvoidRepeat(
        'searchResultsIntro',
        [
          `Esto encontré para *${query}*:`,
          `Resultados para *${query}*:`,
          `Mira lo que tenemos parecido a *${query}*:`,
        ],
        lastKeys,
      ),
    searchEmpty: (query) =>
      pickAvoidRepeat(
        'searchEmpty',
        [
          `No encontré nada para *${query}* 🤔 Escribe *catálogo* para ver todo por categoría o dime otra palabra.`,
          `No tengo resultados para *${query}*. Prueba con otra palabra o escribe *catálogo*.`,
        ],
        lastKeys,
      ),
    itemRemoved: (name) =>
      pickAvoidRepeat(
        'itemRemoved',
        [
          `Quité *${name}* de tu carrito.`,
          `Listo, saqué *${name}* del carrito.`,
          `*${name}* fuera del carrito 👍`,
        ],
        lastKeys,
      ),
    itemRemoveNotFound: () =>
      pickAvoidRepeat(
        'itemRemoveNotFound',
        [
          'No ubico ese producto en tu carrito. Escribe *quita* y el *número* de la lista (ej: *quita 1*).',
          '¿Cuál quito? Usa *quita* + el número del producto (ej: *quita 2*).',
        ],
        lastKeys,
      ),
    checkoutCancelled: () =>
      pickAvoidRepeat(
        'checkoutCancelled',
        [
          'Listo, cancelé el checkout. Tu carrito sigue guardado 🛒',
          'Sin problema, dejamos el pedido para después. Tu carrito no se pierde.',
        ],
        lastKeys,
      ),
  };
  return COPY;
}

if (typeof module !== 'undefined') {
  module.exports = { pick, pickAvoidRepeat, timeGreeting, buildCopy };
}
