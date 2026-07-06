const { flujoCatalogo } = require('../flujos/catalogo.js');
const copySrc = require('../../templates/zent-copy-variants.source.js');

const copys = {
  pick: copySrc.pick,
  pickAvoidRepeat: copySrc.pickAvoidRepeat,
  timeGreeting: copySrc.timeGreeting,
  buildCopy: copySrc.buildCopy,
};

function ctxBase(extra = {}) {
  return {
    mensaje: 'catalogo',
    msj: 'catalogo',
    intencion: 'catalogo',
    sesion: {
      storeName: 'ohana',
      customer: { found: true, name: 'Pablo' },
      flow: { phase: 'main_menu' },
      cart: { items: [], total: 0 },
      cartTtlMinutes: 30,
    },
    entrada: { chatId: 'x', waSessionId: 's', contactPhone: '519' },
    claveEstado: 's::x',
    copys,
    llamarHerramienta: async () => null,
    ...extra,
  };
}

const categorias = [{ id: 'c1', name: 'oficina', productCount: 2 }];
const productos = [
  { id: 'p1', name: 'papel grueso', price: 50, lowStock: false, imageUrl: '/api/uploads/p1.jpg', description: 'papel para imprimir' },
  { id: 'p2', name: 'regla', price: 30, lowStock: false, imageUrl: null, description: null },
];

function sinFiller(r, caso) {
  if (/momentito|segundito|voy a mirarlo/i.test(r.respuesta)) {
    console.error(`FAIL ${caso}: respuesta es filler:`, r.respuesta);
    process.exit(1);
  }
}

(async () => {
  // 1. Entrada al catálogo sin categoryList → await categories.list → lista directa
  const llamadas1 = [];
  const r1 = await flujoCatalogo(
    ctxBase({
      llamarHerramienta: async (n) => {
        llamadas1.push(n);
        if (n === 'categories.list') return { categories: categorias };
        return null;
      },
    }),
  );
  sinFiller(r1, 'categorias');
  if (!llamadas1.includes('categories.list') || !/oficina/i.test(r1.respuesta)) {
    console.error('FAIL categorias:', r1.respuesta);
    process.exit(1);
  }
  if (r1.parche.phase !== 'browse_categories' || !r1.parche.categoryList?.length) {
    console.error('FAIL categorias parche:', r1.parche);
    process.exit(1);
  }

  // 2. browse_categories + "1" → products.by_category → lista de productos
  const r2 = await flujoCatalogo(
    ctxBase({
      mensaje: '1',
      msj: '1',
      intencion: 'numero',
      sesion: {
        storeName: 'ohana',
        customer: { found: true, name: 'Pablo' },
        flow: { phase: 'browse_categories', categoryList: categorias },
        cart: { items: [], total: 0 },
        cartTtlMinutes: 30,
      },
      llamarHerramienta: async (n, c) => {
        if (n === 'products.by_category' && c.categoryId === 'c1') return { products: productos };
        return null;
      },
    }),
  );
  sinFiller(r2, 'productos');
  if (!/papel grueso/i.test(r2.respuesta) || !/regla/i.test(r2.respuesta)) {
    console.error('FAIL productos:', r2.respuesta);
    process.exit(1);
  }
  if (r2.parche.phase !== 'browse_products' || r2.parche.lastProductList?.length !== 2) {
    console.error('FAIL productos parche:', r2.parche);
    process.exit(1);
  }

  // 3. browse_products + "1" → send_image + pedir cantidad
  const llamadas3 = [];
  const r3 = await flujoCatalogo(
    ctxBase({
      mensaje: '1',
      msj: '1',
      intencion: 'numero',
      sesion: {
        storeName: 'ohana',
        customer: { found: true, name: 'Pablo' },
        flow: { phase: 'browse_products', categoryName: 'oficina', lastProductList: productos },
        cart: { items: [], total: 0 },
        cartTtlMinutes: 30,
      },
      llamarHerramienta: async (n, c) => {
        llamadas3.push([n, c]);
        if (n === 'products.send_image') return { sent: true, productId: c.productId };
        return null;
      },
    }),
  );
  sinFiller(r3, 'detalle');
  if (!llamadas3.some(([n]) => n === 'products.send_image')) {
    console.error('FAIL detalle: no envió imagen', llamadas3);
    process.exit(1);
  }
  if (!/cantidad|cu[aá]ntas/i.test(r3.respuesta)) {
    console.error('FAIL detalle: no pide cantidad:', r3.respuesta);
    process.exit(1);
  }
  if (r3.parche.phase !== 'product_detail' || r3.parche.selectedProductId !== 'p1') {
    console.error('FAIL detalle parche:', r3.parche);
    process.exit(1);
  }
  // No repetir nombre/precio en texto si la imagen (con caption) salió bien
  if (/papel grueso|50\.00/i.test(r3.respuesta)) {
    console.error('FAIL detalle: repite info que ya va en el caption:', r3.respuesta);
    process.exit(1);
  }

  // 3b. Imagen falla → detalle en texto + cantidad (nunca colgarse)
  const r3b = await flujoCatalogo(
    ctxBase({
      mensaje: '1',
      msj: '1',
      intencion: 'numero',
      sesion: {
        storeName: 'ohana',
        customer: { found: true, name: 'Pablo' },
        flow: { phase: 'browse_products', categoryName: 'oficina', lastProductList: productos },
        cart: { items: [], total: 0 },
        cartTtlMinutes: 30,
      },
      llamarHerramienta: async () => null,
    }),
  );
  sinFiller(r3b, 'detalle sin imagen');
  if (!/papel grueso/i.test(r3b.respuesta) || !/cantidad|cu[aá]ntas/i.test(r3b.respuesta)) {
    console.error('FAIL detalle sin imagen:', r3b.respuesta);
    process.exit(1);
  }

  // 4. product_detail + "3" → cart.add_item con carrito devuelto por la tool
  const llamadas4 = [];
  const r4 = await flujoCatalogo(
    ctxBase({
      mensaje: '3',
      msj: '3',
      intencion: 'numero',
      sesion: {
        storeName: 'ohana',
        customer: { found: true, name: 'Pablo' },
        flow: { phase: 'product_detail', selectedProductId: 'p1', categoryName: 'oficina', lastProductList: productos },
        cart: { items: [], total: 0 },
        cartTtlMinutes: 30,
      },
      llamarHerramienta: async (n, c) => {
        llamadas4.push([n, c]);
        if (n === 'cart.add_item') {
          return {
            cart: {
              items: [{ productId: 'p1', nombre: 'papel grueso', quantity: 3, unitPrice: 50 }],
              subtotal: 150,
              deliveryCost: 0,
              total: 150,
            },
            reservedMinutes: 30,
          };
        }
        return null;
      },
    }),
  );
  sinFiller(r4, 'agregar');
  if (!llamadas4.some(([n, c]) => n === 'cart.add_item' && c.quantity === 3 && c.productId === 'p1')) {
    console.error('FAIL agregar: no llamó cart.add_item con qty 3', llamadas4);
    process.exit(1);
  }
  if (!/papel grueso/i.test(r4.respuesta) || !/150\.00/.test(r4.respuesta)) {
    console.error('FAIL agregar: resumen no usa el carrito de la tool:', r4.respuesta);
    process.exit(1);
  }
  if (r4.parche.phase !== 'cart') {
    console.error('FAIL agregar parche:', r4.parche);
    process.exit(1);
  }

  // 4b. cart.add_item falla → respuesta honesta, fase se mantiene
  const r4b = await flujoCatalogo(
    ctxBase({
      mensaje: '3',
      msj: '3',
      intencion: 'numero',
      sesion: {
        storeName: 'ohana',
        customer: { found: true, name: 'Pablo' },
        flow: { phase: 'product_detail', selectedProductId: 'p1', categoryName: 'oficina', lastProductList: productos },
        cart: { items: [], total: 0 },
        cartTtlMinutes: 30,
      },
      llamarHerramienta: async () => null,
    }),
  );
  sinFiller(r4b, 'agregar fallido');
  if (!/no pude|intenta/i.test(r4b.respuesta)) {
    console.error('FAIL agregar fallido: respuesta no es honesta:', r4b.respuesta);
    process.exit(1);
  }

  // 5. Producto con variantes: elegir producto → pide opción, no cantidad
  const polo = {
    id: 'p9',
    name: 'polo',
    price: 50,
    lowStock: false,
    imageUrl: null,
    description: null,
    atributos: 'Marca: Faber',
    variantes: [
      { id: 'v1', etiqueta: 'Rojo / M', precio: 50, stock: 3 },
      { id: 'v2', etiqueta: 'Azul / L', precio: 55, stock: 2 },
    ],
  };
  const sesionVariantes = (flow) => ({
    storeName: 'ohana',
    customer: { found: true, name: 'Pablo' },
    flow,
    cart: { items: [], total: 0 },
    cartTtlMinutes: 30,
  });
  const r5 = await flujoCatalogo(
    ctxBase({
      mensaje: '1',
      msj: '1',
      intencion: 'numero',
      sesion: sesionVariantes({ phase: 'browse_products', categoryName: 'ropa', lastProductList: [polo] }),
    }),
  );
  sinFiller(r5, 'variantes detalle');
  if (!/rojo \/ m/i.test(r5.respuesta) || !/azul \/ l/i.test(r5.respuesta)) {
    console.error('FAIL variantes: no lista opciones:', r5.respuesta);
    process.exit(1);
  }
  if (/cu[aá]ntas|cantidad/i.test(r5.respuesta)) {
    console.error('FAIL variantes: pide cantidad antes de la opción:', r5.respuesta);
    process.exit(1);
  }
  if (r5.parche.esperandoVariante !== true) {
    console.error('FAIL variantes parche:', r5.parche);
    process.exit(1);
  }

  // 6. Elegir opción "2" → guarda variante y pide cantidad
  const r6 = await flujoCatalogo(
    ctxBase({
      mensaje: '2',
      msj: '2',
      intencion: 'numero',
      sesion: sesionVariantes({
        phase: 'product_detail',
        selectedProductId: 'p9',
        lastProductList: [polo],
        esperandoVariante: true,
      }),
    }),
  );
  sinFiller(r6, 'variante elegida');
  if (!/azul \/ l/i.test(r6.respuesta) || !/cantidad|cu[aá]ntas/i.test(r6.respuesta)) {
    console.error('FAIL variante elegida:', r6.respuesta);
    process.exit(1);
  }
  if (r6.parche.varianteSeleccionada?.id !== 'v2') {
    console.error('FAIL variante elegida parche:', r6.parche);
    process.exit(1);
  }

  // 7. Cantidad tras variante → cart.add_item lleva variantId
  const llamadas7 = [];
  const r7 = await flujoCatalogo(
    ctxBase({
      mensaje: '2',
      msj: '2',
      intencion: 'numero',
      sesion: sesionVariantes({
        phase: 'product_detail',
        selectedProductId: 'p9',
        lastProductList: [polo],
        varianteSeleccionada: { id: 'v2', etiqueta: 'Azul / L', precio: 55 },
      }),
      llamarHerramienta: async (n, c) => {
        llamadas7.push([n, c]);
        if (n === 'cart.add_item') {
          return {
            cart: {
              items: [{ productId: 'p9', nombre: 'polo (Azul / L)', quantity: 2, unitPrice: 55, variantId: 'v2' }],
              subtotal: 110,
              deliveryCost: 0,
              total: 110,
            },
            reservedMinutes: 30,
          };
        }
        return null;
      },
    }),
  );
  sinFiller(r7, 'agregar variante');
  const llamadaAdd = llamadas7.find(([n]) => n === 'cart.add_item');
  if (!llamadaAdd || llamadaAdd[1].variantId !== 'v2' || llamadaAdd[1].quantity !== 2) {
    console.error('FAIL agregar variante: cart.add_item sin variantId', llamadas7);
    process.exit(1);
  }
  if (!/azul \/ l/i.test(r7.respuesta) || !/110\.00/.test(r7.respuesta)) {
    console.error('FAIL agregar variante resumen:', r7.respuesta);
    process.exit(1);
  }

  console.log('OK catalogo');
})();
