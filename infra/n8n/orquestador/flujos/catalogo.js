/**
 * Flujo Catálogo — browse_categories, browse_products, product_detail.
 *
 * Reglas de números (SOLO aquí se interpretan dígitos):
 * | Fase              | "1" significa      |
 * |-------------------|--------------------|
 * | browse_categories | Categoría #1       |
 * | browse_products   | Ver producto #1    |
 * | product_detail    | Cantidad = 1       |
 */

async function flujoCatalogo(ctx) {
  const { mensaje, msj, intencion, sesion, entrada, claveEstado, copys, llamarHerramienta } = ctx;
  const { COPY, unir, claves } = prepararCopys(copys, sesion);
  const flujo = { ...(sesion.flow || {}) };
  const tienda = sesion.storeName || 'Zent';
  const cliente = sesion.customer || { found: false };
  const reservaMin = sesion.cartTtlMinutes || 30;

  const AYUDA_PRODUCTOS =
    '\n\nEscribe el *número* para ver un producto, su nombre, o *agregar 2* para añadir directo.';

  // Hechos compactos para el modo "n8n + IA" — sin plantillas, la IA los redacta.
  function productosParaIA(productos) {
    return productos.map((p) => ({
      nombre: p.name,
      precio: p.price,
      stock: p.lowStock ? 'poco stock' : 'disponible',
      caracteristicas: p.atributos || null,
      opciones: (p.variantes || []).map((v) => ({ etiqueta: v.etiqueta, precio: v.precio })),
    }));
  }

  async function mostrarCategorias() {
    let cats = flujo.categoryList || [];
    const resultado = await llamarHerramienta('categories.list', {});
    if (resultado?.categories?.length) cats = resultado.categories;
    if (!cats.length) {
      return {
        respuesta:
          'No pude cargar el catálogo en este momento 😔 Intenta de nuevo en unos minutos o escribe *asesor*.',
        parche: { phase: 'main_menu', lastCopyKeys: { ...claves } },
      };
    }
    const respuesta =
      unir(COPY.catalogWelcome(tienda)) +
      '\n\n' +
      unir(COPY.categoriesIntro()) +
      '\n\n' +
      cats.map((c, i) => `${tecla(i + 1)} ${c.name}`).join('\n');
    return {
      respuesta,
      datosIA: {
        tipo: 'categorias',
        tienda,
        categorias: cats.map((c) => ({ nombre: c.name, cantidadProductos: c.productCount })),
        siguientePaso: 'Escribe el nombre o número de la categoría que te interesa.',
      },
      parche: {
        phase: 'browse_categories',
        categoryList: cats.map((c) => ({ id: c.id, name: c.name, productCount: c.productCount })),
        selectedProductId: null,
        esperandoVariante: null,
        varianteSeleccionada: null,
        lastCopyKeys: { ...claves },
      },
    };
  }

  async function mostrarProductos(categoria) {
    const resultado = await llamarHerramienta('products.by_category', { categoryId: categoria.id });
    const productos = resultado?.products || [];
    if (!productos.length) {
      return {
        respuesta: `En *${categoria.name}* no hay productos disponibles ahora. Escribe *catálogo* para ver otras categorías.`,
        parche: { phase: 'browse_categories', lastCopyKeys: { ...claves } },
      };
    }
    const listaGuardada = productos.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      lowStock: p.lowStock,
      imageUrl: p.imageUrl,
      description: p.description || null,
      atributos: p.atributos || null,
      variantes: p.variantes || [],
    }));
    const fmt = listaProductos(productos, 0);
    const respuesta =
      unir(COPY.productsIntro(categoria.name)) +
      '\n\n' +
      fmt.texto +
      (fmt.hayMas ? '\n\n' + unir(COPY.paginationMore()) : '') +
      AYUDA_PRODUCTOS;
    return {
      respuesta,
      datosIA: {
        tipo: 'productos',
        categoria: categoria.name,
        productos: productosParaIA(productos),
        siguientePaso: 'Escribe el nombre o número del producto que te interesa, o "agregar N" para añadirlo directo.',
      },
      parche: {
        phase: 'browse_products',
        categoryId: categoria.id,
        categoryName: categoria.name,
        lastProductList: listaGuardada,
        productPage: 0,
        selectedProductId: null,
        lastCopyKeys: { ...claves },
      },
    };
  }

  function listarDeNuevo(lista) {
    const fmt = listaProductos(lista, flujo.productPage || 0);
    return (
      unir(COPY.productsIntro(flujo.categoryName || 'catálogo')) + '\n\n' + fmt.texto + AYUDA_PRODUCTOS
    );
  }

  function listarVariantes(producto) {
    const hayFotos = producto.variantes.some((v) => v.imageUrl);
    return (
      'Elige una *opción*:\n' +
      producto.variantes
        .map((v, i) => `${tecla(i + 1)} ${v.etiqueta} — S/ ${Number(v.precio).toFixed(2)}`)
        .join('\n') +
      (hayFotos ? '\n\n' + unir(COPY.verFotoOpcionHint()) : '')
    );
  }

  async function mostrarDetalle(producto) {
    const tieneVariantes = Boolean(producto.variantes?.length);
    const parche = {
      phase: 'product_detail',
      selectedProductId: producto.id,
      esperandoVariante: tieneVariantes ? true : null,
      varianteSeleccionada: null,
      lastCopyKeys: { ...claves },
    };
    const datosIA = {
      tipo: 'producto_detalle',
      producto: {
        nombre: producto.name,
        precio: producto.price,
        descripcion: producto.description || null,
        caracteristicas: producto.atributos || null,
        opciones: (producto.variantes || []).map((v) => ({ etiqueta: v.etiqueta, precio: v.precio })),
      },
      siguientePaso: tieneVariantes
        ? 'Pídele que elija una opción (por nombre o número).'
        : 'Pregúntale cuántas unidades quiere.',
    };
    // Con variantes se pide primero la opción; sin variantes, la cantidad.
    const siguiente = tieneVariantes ? listarVariantes(producto) : unir(COPY.productAskQuantity());
    if (producto.imageUrl) {
      const envio = await llamarHerramienta('products.send_image', {
        chatId: entrada.chatId,
        waSessionId: entrada.waSessionId,
        productId: producto.id,
        caption: leyendaImagen(producto),
      });
      if (envio?.sent) {
        // La foto ya lleva nombre/precio en el caption.
        return { respuesta: siguiente, datosIA, parche };
      }
    }
    return {
      respuesta: detalleProducto(producto) + '\n\n' + siguiente,
      datosIA,
      parche,
    };
  }

  async function agregarAlCarrito(producto, cantidad) {
    const resultado = await llamarHerramienta('cart.add_item', {
      stateKey: claveEstado,
      chatId: claveEstado || entrada.chatId,
      contactPhone: entrada.contactPhone,
      productId: producto.id,
      quantity: cantidad,
      customerName: cliente.found ? cliente.name : undefined,
      variantId: flujo.varianteSeleccionada?.id,
    });
    if (!resultado?.cart) {
      return {
        respuesta:
          'No pude agregar el producto al carrito 😔 Intenta de nuevo con la *cantidad* o escribe *asesor*.',
        parche: { lastCopyKeys: { ...claves } },
      };
    }
    const minutos = resultado.reservedMinutes || reservaMin;
    const respuesta =
      unir(COPY.addedToCart(producto.name, cantidad, minutos)) +
      '\n\n' +
      unir(COPY.cartSummary()) +
      '\n' +
      resumenCarrito(resultado.cart, { numerar: true }) +
      '\n\n' +
      unir(COPY.keepShopping());
    return {
      respuesta,
      datosIA: {
        tipo: 'carrito_actualizado',
        agregado: { nombre: producto.name, cantidad },
        carrito: (resultado.cart.items || []).map((i) => ({ nombre: i.nombre, cantidad: i.quantity })),
        total: resultado.cart.total,
        reservaMinutos: minutos,
        siguientePaso: 'Escribe "confirmar pedido" para finalizar, o sigue viendo el catálogo.',
      },
      parche: {
        phase: 'cart',
        selectedProductId: null,
        esperandoVariante: null,
        varianteSeleccionada: null,
        lastCopyKeys: { ...claves },
      },
    };
  }

  // Búsqueda por texto libre: "tienen papel?", "cuadernos", … → products.search
  async function buscarProductos(query) {
    const resultado = await llamarHerramienta('products.search', { query, limit: 20 });
    const productos = resultado?.products || [];
    if (!productos.length) {
      return {
        respuesta: unir(COPY.searchEmpty(query)),
        parche: { phase: 'main_menu', lastCopyKeys: { ...claves } },
      };
    }
    const listaGuardada = productos.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      lowStock: p.lowStock,
      imageUrl: p.imageUrl,
      description: p.description || null,
      atributos: p.atributos || null,
      variantes: p.variantes || [],
    }));
    const fmt = listaProductos(productos, 0);
    const respuesta =
      unir(COPY.searchResultsIntro(query)) +
      '\n\n' +
      fmt.texto +
      (fmt.hayMas ? '\n\n' + unir(COPY.paginationMore()) : '') +
      AYUDA_PRODUCTOS;
    return {
      respuesta,
      datosIA: {
        tipo: 'busqueda_productos',
        consulta: query,
        productos: productosParaIA(productos),
        siguientePaso: 'Escribe el nombre o número del producto que te interesa, o "agregar N" para añadirlo directo.',
      },
      parche: {
        phase: 'browse_products',
        categoryId: null,
        categoryName: query,
        lastProductList: listaGuardada,
        productPage: 0,
        selectedProductId: null,
        esperandoVariante: null,
        varianteSeleccionada: null,
        lastCopyKeys: { ...claves },
      },
    };
  }

  const query = (mensaje || '').trim();
  const esBusquedaLibre =
    intencion === 'libre' && normalizarMensaje(query).replace(/[^a-z0-9]/g, '').length >= 2;

  // Entrada explícita al catálogo (desde cualquier fase) o fase desconocida
  const fasesCatalogo = ['browse_categories', 'browse_products', 'product_detail'];
  if (intencion === 'catalogo') {
    return mostrarCategorias();
  }
  if (!fasesCatalogo.includes(flujo.phase)) {
    if (esBusquedaLibre) return buscarProductos(query);
    return mostrarCategorias();
  }

  switch (flujo.phase) {
    case 'browse_categories': {
      const cats = flujo.categoryList || [];
      if (!cats.length) return mostrarCategorias();
      const categoria = buscarCategoria(msj, cats);
      if (!categoria) {
        const respuesta =
          'No encontré esa categoría 🤔\n\n' +
          unir(COPY.categoriesIntro()) +
          '\n\n' +
          cats.map((c, i) => `${tecla(i + 1)} ${c.name}`).join('\n');
        return { respuesta, parche: { lastCopyKeys: { ...claves } } };
      }
      return mostrarProductos(categoria);
    }

    case 'browse_products': {
      const lista = flujo.lastProductList || [];
      if (!lista.length) return mostrarCategorias();

      // Paginación: "más" / "siguiente" → siguiente página del listado.
      if (esVerMas(msj)) {
        const paginaActual = flujo.productPage || 0;
        const fmt = listaProductos(lista, paginaActual + 1);
        if (!fmt.texto) {
          return { respuesta: unir(COPY.noMoreProducts()), parche: { lastCopyKeys: { ...claves } } };
        }
        const respuesta =
          unir(COPY.productsIntro(flujo.categoryName || 'catálogo')) +
          '\n\n' +
          fmt.texto +
          (fmt.hayMas ? '\n\n' + unir(COPY.paginationMore()) : '') +
          AYUDA_PRODUCTOS;
        return { respuesta, parche: { productPage: paginaActual + 1, lastCopyKeys: { ...claves } } };
      }

      if (esAgregarDirecto(mensaje)) {
        const directo = buscarProductoConCantidad(mensaje, lista);
        if (directo) return agregarAlCarrito(directo.producto, directo.cantidad);
      }

      const elegido = elegirProducto(mensaje, lista);
      if (!elegido) {
        // Antes de rendirse: quizá busca otro producto de todo el catálogo.
        if (esBusquedaLibre) {
          const r = await buscarProductos(query);
          if (r.parche.phase === 'browse_products') return r;
        }
        return {
          respuesta: unir(COPY.productNotFound()) + '\n\n' + listarDeNuevo(lista),
          parche: { lastCopyKeys: { ...claves } },
        };
      }
      return mostrarDetalle(elegido);
    }

    case 'product_detail': {
      const lista = flujo.lastProductList || [];
      const actual = lista.find((p) => p.id === flujo.selectedProductId);

      if (/^0$|^volver$|^lista$/.test(msj)) {
        return {
          respuesta: listarDeNuevo(lista),
          parche: {
            phase: 'browse_products',
            selectedProductId: null,
            esperandoVariante: null,
            varianteSeleccionada: null,
            lastCopyKeys: { ...claves },
          },
        };
      }

      // Esperando elección de subproducto (Color/Talla/…): el número es la OPCIÓN
      if (flujo.esperandoVariante && actual?.variantes?.length) {
        // "foto 2" (con prefijo textual, nunca un dígito pelado) → manda la foto de
        // esa opción sin avanzar de fase; el cliente sigue pudiendo elegir después.
        const nFoto = esVerFotoOpcion(msj);
        if (nFoto) {
          const objetivo = actual.variantes[nFoto - 1];
          if (!objetivo) {
            return {
              respuesta: 'No ubico esa opción 🤔\n\n' + listarVariantes(actual),
              parche: { lastCopyKeys: { ...claves } },
            };
          }
          if (!objetivo.imageUrl) {
            return { respuesta: unir(COPY.opcionSinFoto()), parche: { lastCopyKeys: { ...claves } } };
          }
          const envio = await llamarHerramienta('products.send_image', {
            chatId: entrada.chatId,
            waSessionId: entrada.waSessionId,
            productId: actual.id,
            variantId: objetivo.id,
            caption: `${objetivo.etiqueta} — S/ ${Number(objetivo.precio).toFixed(2)}`,
          });
          // Nunca dejar la foto "sola": siempre invitar al siguiente paso (elegirla
          // o seguir comparando), para que no se sienta como un envío seco.
          const respuesta = envio?.sent
            ? unir(COPY.fotoOpcionEnviada(nFoto, actual.variantes.length > 1))
            : unir(COPY.opcionSinFoto());
          return { respuesta, parche: { lastCopyKeys: { ...claves } } };
        }

        let variante = null;
        if (/^\d+$/.test(msj)) {
          const n = parseInt(msj, 10);
          if (n >= 1 && n <= actual.variantes.length) variante = actual.variantes[n - 1];
        } else {
          variante = actual.variantes.find(
            (v) =>
              normalizarMensaje(v.etiqueta).includes(msj) ||
              msj.includes(normalizarMensaje(v.etiqueta)),
          );
        }
        if (!variante) {
          return {
            respuesta: 'No ubico esa opción 🤔\n\n' + listarVariantes(actual),
            parche: { lastCopyKeys: { ...claves } },
          };
        }
        return {
          respuesta:
            `Elegiste *${variante.etiqueta}* — S/ ${Number(variante.precio).toFixed(2)}\n\n` +
            unir(COPY.productAskQuantity()),
          parche: {
            esperandoVariante: null,
            varianteSeleccionada: {
              id: variante.id,
              etiqueta: variante.etiqueta,
              precio: variante.precio,
            },
            lastCopyKeys: { ...claves },
          },
        };
      }

      // En esta fase un número es CANTIDAD (regla documentada arriba)
      const cantidad = leerCantidad(mensaje);
      if (cantidad > 0 && actual) {
        return agregarAlCarrito(actual, cantidad);
      }

      // Texto no numérico: puede ser otro producto de la lista
      const otro = elegirProducto(mensaje, lista);
      if (otro && otro.id !== flujo.selectedProductId) {
        return mostrarDetalle(otro);
      }

      if (!actual) return mostrarCategorias();
      return {
        respuesta: detalleProducto(actual) + '\n\n' + unir(COPY.productAskQuantity()),
        parche: { lastCopyKeys: { ...claves } },
      };
    }

    default:
      return mostrarCategorias();
  }
}

if (typeof module !== 'undefined') {
  Object.assign(global, require('../nucleo/intencion.js'));
  Object.assign(global, require('../nucleo/productos.js'));
  Object.assign(global, require('../nucleo/copys.js'));
  module.exports = { flujoCatalogo };
}
