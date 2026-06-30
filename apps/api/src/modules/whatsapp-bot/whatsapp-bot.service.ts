import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsyncLocalStorage } from 'async_hooks';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenwaService } from '../openwa/openwa.service';
import { CartService } from './cart.service';
import { ChatSessionService } from './chat-session.service';
import { CustomersService, normalizePhone } from '../customers/customers.service';
import { OrdersService } from '../orders/orders.service';
import { VendorNotifyService } from '../orders/vendor-notify.service';
import { StockReservationService } from '../inventory/stock-reservation.service';
import { CartHoldService } from '../inventory/cart-hold.service';
import { formatPhoneDisplay, resolvePhoneFromIds } from './wa-contact.util';
import { formatKeycap } from './wa-format.util';
import { ChatState } from '@prisma/client';

export type BotPluginAction = 'sendPdf' | 'showCategories' | 'showCart' | 'handoff';

export interface BotActionContext {
  chatId: string;
  from: string;
  sessionId?: string;
  senderPhone?: string;
}

interface BotContext {
  chatId: string;
  stateKey: string;
  waSessionId?: string;
  contactPhone: string | null;
}

interface BrowseContext {
  categoryId: string;
  productIds: string[];
  /** Índice del producto que el usuario está viendo; en ese modo un número = cantidad. */
  viewingProductIndex?: number;
  /** Tras agregar al carrito: 1–5 eligen la siguiente acción. */
  awaitPostAddMenu?: boolean;
  /** En carrito: usuario eligió eliminar — espera número de línea. */
  awaitCartDelete?: boolean;
}

interface CheckoutData {
  step?: number;
  mode?: 'full' | 'address_only' | 'confirm_saved';
  customerName?: string;
  customerPhone?: string;
  address?: string;
  reference?: string;
}

@Injectable()
export class WhatsappBotService {
  private readonly logger = new Logger(WhatsappBotService.name);
  private readonly ctx = new AsyncLocalStorage<BotContext>();

  constructor(
    private prisma: PrismaService,
    private openwa: OpenwaService,
    private cart: CartService,
    private chatSession: ChatSessionService,
    private customers: CustomersService,
    private orders: OrdersService,
    private vendorNotify: VendorNotifyService,
    private stock: StockReservationService,
    private cartHold: CartHoldService,
    private config: ConfigService,
  ) {}

  private get storeName(): string {
    return this.config.get('STORE_NAME', 'Zent').trim() || 'Zent';
  }

  private async syncCartHold() {
    const cart = await this.cart.getCart(this.c.stateKey);
    const phone = this.c.contactPhone;
    const existing = phone ? await this.customers.findByPhone(phone) : null;
    await this.cartHold.syncFromCart(this.c.stateKey, cart, {
      chatId: this.c.chatId,
      contactPhone: phone,
      customerName: existing?.name ?? null,
    });
  }

  /** Tras expiración del hold o inactividad: vacía carrito, libera stock y reinicia bot. */
  private async resetShoppingSession() {
    await this.cart.clearCart(this.c.stateKey);
    await this.cartHold.release(this.c.stateKey);
    await this.cartHold.clearExpiredCart(this.c.stateKey);
    await this.chatSession.updateContext(this.c.stateKey, null);
    await this.chatSession.updateState(this.c.stateKey, ChatState.MENU_PRINCIPAL, { cartJson: null });
  }

  /**
   * Si el hold expiró pero el carrito Redis quedó, o pasó el TTL sin escribir,
   * limpia todo antes de procesar el mensaje.
   */
  private async ensureSessionFresh(): Promise<'expired' | 'idle' | null> {
    const session = await this.chatSession.peek(this.c.stateKey);
    if (!session) return null;

    const ttlMs = this.cartHold.getTtlSeconds() * 1000;
    const idleMs = Date.now() - session.lastInteractionAt.getTime();
    const cart = await this.cart.getCart(this.c.stateKey);
    const hold = await this.cartHold.getHold(this.c.stateKey);
    const cartOrphaned = cart.items.length > 0 && !hold;
    const idleExpired = idleMs > ttlMs && session.state !== ChatState.PEDIDO_CREADO;

    if (cartOrphaned) {
      await this.resetShoppingSession();
      return 'expired';
    }
    if (idleExpired) {
      await this.resetShoppingSession();
      return 'idle';
    }
    return null;
  }

  async runAction(action: BotPluginAction, ctx: BotActionContext): Promise<void> {
    const stateKey = ctx.sessionId ? `${ctx.sessionId}::${ctx.chatId}` : ctx.chatId;
    let contactPhone = resolvePhoneFromIds(ctx.chatId, ctx.from, ctx.senderPhone);
    if (!contactPhone && (ctx.chatId.includes('@lid') || ctx.from.includes('@lid'))) {
      const resolved = await this.openwa.resolveContactPhone(ctx.from || ctx.chatId, ctx.sessionId);
      contactPhone = resolved ? normalizePhone(resolved) : null;
    }
    return this.ctx.run(
      { chatId: ctx.chatId, stateKey, waSessionId: ctx.sessionId, contactPhone },
      async () => {
        switch (action) {
          case 'sendPdf':
            await this.enviarCatalogoPDF();
            break;
          case 'showCategories':
            await this.mostrarCategorias();
            break;
          case 'showCart':
            await this.mostrarCarrito();
            break;
          case 'handoff':
            await this.handoffHumano();
            break;
        }
      },
    );
  }

  /** Pie del menú de acciones en el carrito. */
  private cartMenuHint(): string {
    return (
      '\n\n*¿Qué deseas hacer?*\n' +
      `${formatKeycap(1)} Confirmar pedido\n` +
      `${formatKeycap(2)} Eliminar un producto\n` +
      `${formatKeycap(3)} Seguir comprando\n` +
      `${formatKeycap(4)} Menú inicio\n` +
      `${formatKeycap(5)} Hablar con un asesor\n\n` +
      'Escribe el número de tu opción:'
    );
  }

  private formatCartDeletePrompt(cart: { items: { nombre: string; quantity: number }[] }): string {
    const lines = cart.items.map(
      (item, i) => `${formatKeycap(i + 1)} ${item.nombre} — ${item.quantity}x`,
    );
    return (
      '*¿Qué producto eliminar?*\n\n' +
      lines.join('\n') +
      `\n\nEscribe el número del 1 al ${cart.items.length}:`
    );
  }

  /** Pie reutilizable tras agregar al carrito. */
  private seguirComprandoHint(): string {
    return (
      '\n\n*¿Qué deseas hacer?*\n' +
      `${formatKeycap(1)} Ver más productos de esta categoría\n` +
      `${formatKeycap(2)} Cambiar categoría\n` +
      `${formatKeycap(3)} Ver mi carrito\n` +
      `${formatKeycap(4)} Confirmar pedido\n` +
      `${formatKeycap(5)} Hablar con un asesor\n\n` +
      'Escribe el número de tu opción:\n' +
      '_(Escribe *menu* para volver al inicio)_'
    );
  }

  private async handlePostAddMenu(ctx: BrowseContext, text: string): Promise<boolean> {
    if (text === '1') {
      await this.saveBrowseContext({ ...ctx, awaitPostAddMenu: undefined });
      await this.mostrarProductosCategoria(ctx.categoryId);
      return true;
    }
    if (text === '2') {
      await this.saveBrowseContext({ ...ctx, awaitPostAddMenu: undefined });
      await this.mostrarCategorias();
      return true;
    }
    if (text === '3') {
      await this.saveBrowseContext({ ...ctx, awaitPostAddMenu: undefined });
      await this.mostrarCarrito();
      return true;
    }
    if (text === '4') {
      await this.saveBrowseContext({ ...ctx, awaitPostAddMenu: undefined });
      await this.confirmarPedido();
      return true;
    }
    if (text === '5') {
      await this.saveBrowseContext({ ...ctx, awaitPostAddMenu: undefined });
      await this.handoffHumano();
      return true;
    }
    return false;
  }

  private async saveBrowseContext(ctx: BrowseContext) {
    await this.chatSession.updateContext(this.c.stateKey, ctx);
  }

  /** Aviso solo cuando el stock está en o por debajo del mínimo configurado. */
  private lowStockHint(stock: number, minStock: number): string {
    if (stock <= minStock) return ' *¡Quedan pocas unidades!*';
    return '';
  }

  async handleMessage(
    chatId: string,
    body: string,
    from: string,
    waSessionId?: string,
    senderPhone?: string,
  ) {
    const stateKey = waSessionId ? `${waSessionId}::${chatId}` : chatId;
    let contactPhone = resolvePhoneFromIds(chatId, from, senderPhone);
    if (!contactPhone && (chatId.includes('@lid') || from.includes('@lid'))) {
      const resolved = await this.openwa.resolveContactPhone(from || chatId, waSessionId);
      contactPhone = resolved ? normalizePhone(resolved) : null;
    }
    return this.ctx.run({ chatId, stateKey, waSessionId, contactPhone }, () =>
      this.processMessage(body),
    );
  }

  private get c(): BotContext {
    const store = this.ctx.getStore();
    if (!store) throw new Error('Bot context not initialized');
    return store;
  }

  private txt(text: string) {
    return this.openwa.sendText({ chatId: this.c.chatId, text, sessionId: this.c.waSessionId });
  }

  private img(image: { url: string }, caption: string) {
    return this.openwa.sendImage({
      chatId: this.c.chatId,
      image,
      caption,
      sessionId: this.c.waSessionId,
    });
  }

  private doc(document: { url: string; mimetype: string }, caption: string) {
    return this.openwa.sendDocument({
      chatId: this.c.chatId,
      document,
      caption,
      sessionId: this.c.waSessionId,
    });
  }

  private async processMessage(body: string) {
    const text = body.trim().toLowerCase();
    const staleReason = await this.ensureSessionFresh();

    const session = await this.chatSession.getOrCreate(this.c.stateKey);

    const greetings = ['hola', 'buenas', 'buenos dias', 'buenos días', 'hi', 'hello', 'ola'];
    const isGreeting = greetings.includes(text) || text === 'menu' || text === 'inicio' || text === '0';

    if (staleReason && !isGreeting) {
      await this.txt(
        staleReason === 'expired'
          ? '⏱️ Tu carrito anterior expiró y el stock ya no está reservado. Empecemos de nuevo 👇'
          : '⏱️ Pasó mucho tiempo sin actividad. Empecemos de nuevo 👇',
      );
      await this.showMainMenu();
      return;
    }

    if (text === 'asesor' || text === 'humano' || text === 'agente') {
      await this.handoffHumano();
      return;
    }

    if (isGreeting) {
      await this.showMainMenu();
      return;
    }

    switch (session.state) {
      case ChatState.MENU_PRINCIPAL:
        if (['1', '2', '3', '4'].includes(text)) {
          await this.handleMenuPrincipal(text);
        } else {
          await this.showMainMenu();
        }
        break;
      case ChatState.CATALOGO_PDF:
        await this.showMainMenu();
        break;
      case ChatState.SELECCION_CATEGORIA:
        await this.handleSeleccionCategoria(text);
        break;
      case ChatState.LISTADO_PRODUCTOS:
        await this.handleListadoProductos(text);
        break;
      case ChatState.CARRITO:
        await this.handleCarrito(text);
        break;
      case ChatState.CONFIRMAR_PEDIDO:
        await this.handleConfirmarPedido(text);
        break;
      case ChatState.DATOS_ENTREGA:
        await this.handleDatosEntrega(text);
        break;
      case ChatState.PEDIDO_CREADO:
        await this.showMainMenu();
        break;
      case ChatState.HANDOFF_HUMANO:
        await this.txt('Un asesor te atenderá pronto. Por favor espera.');
        break;
    }
  }

  /** Menú al confirmar datos de entrega guardados. */
  private confirmSavedDataHint(): string {
    return (
      `${formatKeycap(1)} Sí, usar los mismos\n` +
      `${formatKeycap(2)} Cambiar dirección/referencia\n` +
      `${formatKeycap(3)} Cambiar todo\n\n` +
      'Escribe el número de tu opción:'
    );
  }

  private async showMainMenu() {
    await this.chatSession.updateState(this.c.stateKey, ChatState.MENU_PRINCIPAL);
    const phone = this.c.contactPhone;
    const existing = phone ? await this.customers.findByPhone(phone) : null;
    const saludo = existing?.name
      ? `¡Hola, *${existing.name}*! 👋 Bienvenido de nuevo a *${this.storeName}*.\n\n`
      : `¡Hola! 👋 Bienvenido a *${this.storeName}*.\n\n`;
    const text =
      saludo +
      'Para empezar, elige cómo ver el catálogo:\n\n' +
      '1️⃣ Ver catálogo completo (PDF)\n' +
      '2️⃣ Ver productos por categoría\n' +
      '3️⃣ Ver mi carrito\n' +
      '4️⃣ Hablar con un asesor\n\n' +
      'Escribe el número de tu opción:';
    await this.txt(text);
  }

  private async handleMenuPrincipal(text: string) {
    if (text === '1') {
      await this.enviarCatalogoPDF();
    } else if (text === '2') {
      await this.mostrarCategorias();
    } else if (text === '3') {
      await this.mostrarCarrito();
    } else if (text === '4') {
      await this.handoffHumano();
    } else {
      await this.txt('Opción inválida. Escribe 1, 2, 3 o 4.');
    }
  }

  private async enviarCatalogoPDF() {
    const pdf = await this.prisma.catalogPdf.findFirst({ where: { isActive: true } });
    if (pdf) {
      await this.doc(
        { url: pdf.url, mimetype: 'application/pdf' },
        '📋 Aquí tienes nuestro catálogo completo',
      );
      await this.txt(
        '¿Deseas seguir comprando?\n\n' +
          '2️⃣ Ver por categoría\n' +
          '3️⃣ Ver mi carrito\n' +
          'Escribe *menu* para volver al inicio.',
      );
    } else {
      await this.txt(
        'Lo sentimos, el catálogo PDF no está disponible.\n\n' +
          'Puedes ver productos por categoría escribiendo *2* o *menu*.',
      );
    }
    await this.chatSession.updateState(this.c.stateKey, ChatState.MENU_PRINCIPAL);
  }

  /** Productos con stock disponible (físico menos reservas de pedidos pendientes). */
  private async getProductsWithAvailability(categoryId?: string) {
    const products = await this.prisma.product.findMany({
      where: {
        ...(categoryId ? { categoryId } : {}),
        isActive: true,
      },
      orderBy: { nombre: 'asc' },
      include: { images: { orderBy: { orden: 'asc' } } },
    });

    const available: Array<(typeof products)[number] & { availableStock: number }> = [];
    for (const product of products) {
      const availableStock = await this.stock.getAvailableStock(product.id, {
        excludeStateKey: this.c.stateKey,
      });
      if (availableStock > 0) {
        available.push({ ...product, availableStock });
      }
    }
    return available;
  }

  private async mostrarCategorias() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { orden: 'asc' },
    });

    const withProducts: { id: string; nombre: string; count: number }[] = [];
    for (const cat of categories) {
      const products = await this.getProductsWithAvailability(cat.id);
      if (products.length > 0) {
        withProducts.push({ id: cat.id, nombre: cat.nombre, count: products.length });
      }
    }
    if (withProducts.length === 0) {
      await this.txt('No hay productos disponibles en este momento.');
      await this.showMainMenu();
      return;
    }

    let msg = '📂 *Categorías disponibles:*\n\n';
    withProducts.forEach((cat, i) => {
      msg += `${i + 1}️⃣ ${cat.nombre} (${cat.count} productos)\n`;
    });
    msg += '\nEscribe el número de la categoría:';

    await this.chatSession.updateState(this.c.stateKey, ChatState.SELECCION_CATEGORIA);
    await this.txt(msg);
  }

  private async handleSeleccionCategoria(text: string) {
    if (text === 'menu' || text === 'categorias') {
      await this.mostrarCategorias();
      return;
    }

    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { orden: 'asc' },
    });

    const withProducts: typeof categories = [];
    for (const cat of categories) {
      const products = await this.getProductsWithAvailability(cat.id);
      if (products.length > 0) withProducts.push(cat);
    }
    const index = parseInt(text) - 1;

    if (isNaN(index) || index < 0 || index >= withProducts.length) {
      await this.txt('Opción inválida. Escribe el número de la categoría:');
      return;
    }

    await this.mostrarProductosCategoria(withProducts[index].id);
  }

  private async mostrarProductosCategoria(categoryId: string) {
    const products = await this.getProductsWithAvailability(categoryId);

    if (products.length === 0) {
      await this.txt('No hay productos disponibles en esta categoría.');
      await this.mostrarCategorias();
      return;
    }

    const browseCtx: BrowseContext = {
      categoryId,
      productIds: products.map((p) => p.id),
      viewingProductIndex: undefined,
      awaitPostAddMenu: undefined,
    };
    await this.saveBrowseContext(browseCtx);
    await this.chatSession.updateState(this.c.stateKey, ChatState.LISTADO_PRODUCTOS);

    let msg = '📦 *Productos disponibles:*\n\n';
    products.forEach((p, i) => {
      msg += `${formatKeycap(i + 1)} ${p.nombre} — S/ ${p.salePrice}${this.lowStockHint(p.availableStock, p.minStock)}\n`;
    });
    const exampleIdx = products.length > 1 ? 2 : 1;
    msg +=
      '\n*¿Qué quieres hacer?*\n' +
      '• Escribe el *número* para ver foto y detalle\n' +
      `• Escribe *${exampleIdx} 3* para agregar 3 unidades del producto ${exampleIdx}\n` +
      '• Escribe *0* para menú inicio';

    await this.txt(msg);
  }

  private async getBrowseContext(): Promise<BrowseContext | null> {
    const ctx = await this.chatSession.getContext(this.c.stateKey);
    if (!ctx?.productIds?.length) return null;
    return ctx as BrowseContext;
  }

  private async handleListadoProductos(text: string) {
    if (text === 'carrito' || text === 'ver carrito') {
      await this.mostrarCarrito();
      return;
    }
    if (text === 'menu' || text === 'inicio') {
      await this.showMainMenu();
      return;
    }
    if (text === 'categorias' || text === 'categoría' || text === 'categoria') {
      await this.mostrarCategorias();
      return;
    }
    if (text === 'productos' || text === 'volver' || text === 'lista') {
      const ctx = await this.getBrowseContext();
      if (ctx?.categoryId) {
        await this.mostrarProductosCategoria(ctx.categoryId);
      } else {
        await this.mostrarCategorias();
      }
      return;
    }

    const ctx = await this.getBrowseContext();
    if (!ctx) {
      await this.mostrarCategorias();
      return;
    }

    if (ctx.awaitPostAddMenu && ['1', '2', '3', '4', '5'].includes(text)) {
      await this.handlePostAddMenu(ctx, text);
      return;
    }
    if (ctx.awaitPostAddMenu) {
      await this.txt('Opción inválida. Escribe un número del 1 al 5:' + this.seguirComprandoHint());
      return;
    }

    if (ctx.viewingProductIndex !== undefined && text === '0') {
      await this.saveBrowseContext({ ...ctx, viewingProductIndex: undefined });
      await this.mostrarProductosCategoria(ctx.categoryId);
      return;
    }

    if (ctx.viewingProductIndex !== undefined && /^\d+$/.test(text)) {
      const quantity = parseInt(text) || 1;
      await this.agregarAlCarrito(ctx, ctx.viewingProductIndex, quantity);
      return;
    }

    if (text.startsWith('ver ')) {
      const productIndex = parseInt(text.split(' ')[1]) - 1;
      await this.mostrarProductoDetalle(ctx, productIndex);
      return;
    }

    if (text.startsWith('agregar ')) {
      const parts = text.split(' ');
      const productIndex = parseInt(parts[1]) - 1;
      const quantity = parseInt(parts[2]) || 1;
      await this.agregarAlCarrito(ctx, productIndex, quantity);
      return;
    }

    const addMatch = text.match(/^(\d+)\s+(\d+)$/);
    if (addMatch) {
      const productIndex = parseInt(addMatch[1]) - 1;
      const quantity = parseInt(addMatch[2]) || 1;
      await this.agregarAlCarrito(ctx, productIndex, quantity);
      return;
    }

    if (/^\d+$/.test(text)) {
      const productIndex = parseInt(text) - 1;
      await this.mostrarProductoDetalle(ctx, productIndex);
      return;
    }

    const enDetalle = ctx.viewingProductIndex !== undefined;
    await this.txt(
      'No entendí tu mensaje.\n\n' +
        (enDetalle
          ? '• Escribe la *cantidad* (ej: *3*)\n• *0* — volver al listado\n'
          : '• Escribe un *número* para ver un producto\n• Escribe *2 3* para agregar 3 del producto 2\n') +
        '• *0* — menú inicio',
    );
  }

  private async mostrarProductoDetalle(ctx: BrowseContext, index: number) {
    if (isNaN(index) || index < 0 || index >= ctx.productIds.length) {
      await this.txt('Número de producto inválido.');
      return;
    }

    const product = await this.prisma.product.findUnique({
      where: { id: ctx.productIds[index] },
      include: { images: { orderBy: { orden: 'asc' } } },
    });
    if (!product) {
      await this.txt('Producto no encontrado.');
      return;
    }

    await this.saveBrowseContext({ ...ctx, viewingProductIndex: index, awaitPostAddMenu: undefined });

    const availableStock = await this.stock.getAvailableStock(product.id, {
      excludeStateKey: this.c.stateKey,
    });
    const caption =
      `*${product.nombre}*\n` +
      `💰 Precio: S/ ${product.salePrice}\n` +
      (availableStock <= product.minStock ? `⚠️ *¡Quedan pocas unidades!* (${availableStock} disp.)\n` : '') +
      (product.descripcion ? `📝 ${product.descripcion}\n` : '') +
      `\n¿Cuántas unidades deseas?\n` +
      `Escribe la *cantidad* (ej: *3*)\n\n` +
      '*0* — volver al listado de productos';

    if (product.images.length > 0) {
      await this.img({ url: product.images[0].url }, caption);
    } else {
      await this.txt(caption);
    }
  }

  private async agregarAlCarrito(ctx: BrowseContext, index: number, quantity: number) {
    if (isNaN(index) || index < 0 || index >= ctx.productIds.length) {
      await this.txt('Número de producto inválido.');
      return;
    }

    const product = await this.prisma.product.findUnique({
      where: { id: ctx.productIds[index] },
    });
    if (!product) {
      await this.txt('Producto no encontrado.');
      return;
    }

    const available = await this.stock.getAvailableStock(product.id, {
      excludeStateKey: this.c.stateKey,
    });

    if (quantity > available) {
      await this.txt(
        available <= 0
          ? `No hay unidades disponibles de *${product.nombre}* en este momento.`
          : `Solo puedes agregar ${available} unidad(es) de *${product.nombre}*.`,
      );
      return;
    }

    await this.cart.addItem(this.c.stateKey, {
      productId: product.id,
      nombre: product.nombre,
      quantity,
      unitPrice: Number(product.salePrice),
      costAtSale: Number(product.costPrice),
    });

    await this.syncCartHold();

    await this.saveBrowseContext({
      ...ctx,
      viewingProductIndex: undefined,
      awaitPostAddMenu: true,
    });

    await this.txt(`✅ Agregado: ${quantity}x ${product.nombre}` + this.seguirComprandoHint());
  }

  private async mostrarCarrito() {
    let cart = await this.cart.getCart(this.c.stateKey);
    const hold = await this.cartHold.getHold(this.c.stateKey);
    if (cart.items.length > 0 && !hold) {
      await this.resetShoppingSession();
      await this.txt('⏱️ Tu carrito expiró. Escribe *menu* para empezar de nuevo.');
      await this.showMainMenu();
      return;
    }

    await this.syncCartHold();
    cart = await this.cart.getCart(this.c.stateKey);
    if (cart.items.length === 0) {
      await this.txt('🛒 Tu carrito está vacío.\n\nEscribe *menu* para ver productos.');
      await this.showMainMenu();
      return;
    }

    let text = '🛒 *Tu carrito:*\n\n';
    cart.items.forEach((item, i) => {
      text += `${formatKeycap(i + 1)} ${item.nombre}\n   ${item.quantity}x S/ ${item.unitPrice} = S/ ${(item.quantity * item.unitPrice).toFixed(2)}\n\n`;
    });
    text += `💰 *Total: S/ ${cart.total.toFixed(2)}*`;
    text += '\n\n_Para finalizar tu compra, elige la opción *1*._';
    text += this.cartMenuHint();

    const sessionCtx = await this.chatSession.getContext(this.c.stateKey);
    await this.saveBrowseContext({ ...sessionCtx, awaitCartDelete: undefined } as BrowseContext);
    await this.chatSession.updateState(this.c.stateKey, ChatState.CARRITO);
    await this.txt(text);
  }

  private async handleCarrito(text: string) {
    const sessionCtx = await this.chatSession.getContext(this.c.stateKey);

    if (text === 'confirmar' || text === 'finalizar') {
      await this.confirmarPedido();
      return;
    }
    if (text.startsWith('eliminar ')) {
      const index = parseInt(text.split(' ')[1]) - 1;
      const cart = await this.cart.getCart(this.c.stateKey);
      if (index >= 0 && index < cart.items.length) {
        await this.cart.removeItem(this.c.stateKey, cart.items[index].productId);
        await this.syncCartHold();
        await this.txt('✅ Producto eliminado');
        await this.mostrarCarrito();
      } else {
        await this.txt(`Número inválido.\n\n${this.formatCartDeletePrompt(cart)}`);
      }
      return;
    }
    if (text === 'menu' || text === 'inicio' || text === '0') {
      await this.showMainMenu();
      return;
    }
    if (text === 'asesor') {
      await this.handoffHumano();
      return;
    }

    if (sessionCtx.awaitCartDelete) {
      const cart = await this.cart.getCart(this.c.stateKey);
      if (/^\d+$/.test(text)) {
        const index = parseInt(text) - 1;
        if (index >= 0 && index < cart.items.length) {
          await this.cart.removeItem(this.c.stateKey, cart.items[index].productId);
          await this.syncCartHold();
          await this.saveBrowseContext({ ...sessionCtx, awaitCartDelete: undefined } as BrowseContext);
          await this.txt('✅ Producto eliminado');
          await this.mostrarCarrito();
        } else {
          await this.txt(`Número inválido.\n\n${this.formatCartDeletePrompt(cart)}`);
        }
      } else {
        await this.txt(this.formatCartDeletePrompt(cart));
      }
      return;
    }

    if (text === '1') {
      await this.confirmarPedido();
      return;
    }
    if (text === '2') {
      const cart = await this.cart.getCart(this.c.stateKey);
      await this.saveBrowseContext({ ...sessionCtx, awaitCartDelete: true } as BrowseContext);
      await this.txt(this.formatCartDeletePrompt(cart));
      return;
    }
    if (text === '3') {
      const browseCtx = await this.getBrowseContext();
      if (browseCtx?.categoryId) {
        await this.mostrarProductosCategoria(browseCtx.categoryId);
      } else {
        await this.mostrarCategorias();
      }
      return;
    }
    if (text === '4') {
      await this.showMainMenu();
      return;
    }
    if (text === '5') {
      await this.handoffHumano();
      return;
    }

    await this.txt('Opción inválida.' + this.cartMenuHint());
  }

  private async confirmarPedido() {
    const cart = await this.cart.getCart(this.c.stateKey);
    if (cart.items.length === 0) {
      await this.txt('Tu carrito está vacío.');
      await this.showMainMenu();
      return;
    }

    let text = '📋 *Resumen del pedido:*\n\n';
    cart.items.forEach((item) => {
      text += `${item.quantity}x ${item.nombre} — S/ ${(item.quantity * item.unitPrice).toFixed(2)}\n`;
    });
    text += `\n💰 *Total: S/ ${cart.total.toFixed(2)}*\n\n`;
    text += `${formatKeycap(1)} Sí, confirmar pedido\n${formatKeycap(2)} Modificar carrito\n\nEscribe el número de tu opción:`;

    await this.chatSession.updateState(this.c.stateKey, ChatState.CONFIRMAR_PEDIDO);
    await this.txt(text);
  }

  private async handleConfirmarPedido(text: string) {
    if (text === '1' || text === 'si' || text === 'sí' || text === 'confirmar') {
      await this.iniciarDatosEntrega();
    } else if (text === '2' || text === 'carrito') {
      await this.mostrarCarrito();
    } else {
      await this.txt(`${formatKeycap(1)} Confirmar · ${formatKeycap(2)} Modificar carrito\n\nEscribe 1 o 2:`);
    }
  }

  private async iniciarDatosEntrega() {
    const phone = this.c.contactPhone;
    const existing = phone ? await this.customers.findByPhone(phone) : null;

    if (existing && existing.address) {
      const checkoutData: CheckoutData = { mode: 'confirm_saved' };
      await this.chatSession.updateState(this.c.stateKey, ChatState.DATOS_ENTREGA, {
        cartJson: JSON.stringify(checkoutData),
      });
      await this.txt(
        `Hola *${existing.name}*, tenemos tus datos guardados:\n\n` +
          `📍 *Dirección:* ${existing.address}\n` +
          `📞 *Teléfono:* ${existing.phone}\n` +
          `📌 *Referencia:* ${existing.reference || 'N/A'}\n\n` +
          '*¿Confirmas estos datos?*\n' +
          this.confirmSavedDataHint(),
      );
      return;
    }

    const checkoutData: CheckoutData = { step: 0, mode: 'full' };
    await this.chatSession.updateState(this.c.stateKey, ChatState.DATOS_ENTREGA, {
      cartJson: JSON.stringify(checkoutData),
    });
    await this.txt('📝 Para completar tu pedido necesito algunos datos:\n\n1️⃣ *Nombre completo:*');
  }

  private async handleDatosEntrega(text: string) {
    const session = await this.chatSession.getOrCreate(this.c.stateKey);
    const data: CheckoutData = session.cartJson ? JSON.parse(session.cartJson) : { step: 0, mode: 'full' };

    if (data.mode === 'confirm_saved') {
      if (text === '1' || text === 'si' || text === 'sí') {
        const existing = this.c.contactPhone
          ? await this.customers.findByPhone(this.c.contactPhone)
          : null;
        if (existing) {
          await this.crearPedido({
            customerName: existing.name,
            customerPhone: existing.phone,
            address: existing.address ?? undefined,
            reference: existing.reference ?? undefined,
          });
        }
      } else if (text === '2') {
        data.mode = 'address_only';
        data.step = 1;
        await this.chatSession.updateState(this.c.stateKey, ChatState.DATOS_ENTREGA, {
          cartJson: JSON.stringify(data),
        });
        await this.txt('📍 *Nueva dirección de entrega:*');
      } else if (text === '3') {
        data.mode = 'full';
        data.step = 0;
        await this.chatSession.updateState(this.c.stateKey, ChatState.DATOS_ENTREGA, {
          cartJson: JSON.stringify(data),
        });
        await this.txt('1️⃣ *Nombre completo:*');
      } else {
        await this.txt('Opción inválida.\n\n' + this.confirmSavedDataHint());
      }
      return;
    }

    if (data.mode === 'address_only') {
      const existing = this.c.contactPhone
        ? await this.customers.findByPhone(this.c.contactPhone)
        : null;
      if (data.step === 1) {
        data.address = bodyTrim(text);
        data.step = 2;
        await this.chatSession.updateState(this.c.stateKey, ChatState.DATOS_ENTREGA, {
          cartJson: JSON.stringify(data),
        });
        await this.txt('📌 *Nueva referencia del lugar:*');
      } else if (data.step === 2) {
        data.reference = bodyTrim(text);
        await this.crearPedido({
          customerName: existing?.name ?? 'Cliente',
          customerPhone: existing?.phone ?? this.c.contactPhone ?? '',
          address: data.address,
          reference: data.reference,
        });
      }
      return;
    }

    // full wizard
    if (data.step === 0) {
      data.customerName = bodyTrim(text);
      data.step = 1;
      await this.chatSession.updateState(this.c.stateKey, ChatState.DATOS_ENTREGA, {
        cartJson: JSON.stringify(data),
      });
      await this.txt('2️⃣ *Dirección de entrega:*');
    } else if (data.step === 1) {
      data.address = bodyTrim(text);
      data.step = 2;
      await this.chatSession.updateState(this.c.stateKey, ChatState.DATOS_ENTREGA, {
        cartJson: JSON.stringify(data),
      });
      const phoneHint = formatPhoneDisplay(this.c.contactPhone);
      await this.txt(`3️⃣ *Teléfono de contacto:* (o escribe "mismo" para usar ${phoneHint})`);
    } else if (data.step === 2) {
      if (text === 'mismo') {
        if (!this.c.contactPhone) {
          await this.txt('No pude detectar tu número. Escríbelo con código de país, ej: 51987654321');
          return;
        }
        data.customerPhone = this.c.contactPhone;
      } else {
        data.customerPhone = normalizePhone(bodyTrim(text));
      }
      data.step = 3;
      await this.chatSession.updateState(this.c.stateKey, ChatState.DATOS_ENTREGA, {
        cartJson: JSON.stringify(data),
      });
      await this.txt('4️⃣ *Referencia del lugar:* (calle, edificio, color de casa, etc.)');
    } else if (data.step === 3) {
      data.reference = bodyTrim(text);
      await this.crearPedido({
        customerName: data.customerName!,
        customerPhone: data.customerPhone!,
        address: data.address,
        reference: data.reference,
      });
    }
  }

  private async crearPedido(data: {
    customerName: string;
    customerPhone: string;
    address?: string;
    reference?: string;
  }) {
    const cart = await this.cart.getCart(this.c.stateKey);
    if (cart.items.length === 0) {
      await this.txt('Tu carrito está vacío.');
      return;
    }

    const customer = await this.customers.upsertFromOrder(data);

    let order;
    try {
      order = await this.orders.create({
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        address: data.address,
        reference: data.reference,
        customerId: customer.id,
        chatId: this.c.chatId,
        source: 'WHATSAPP',
        items: cart.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costAtSale: item.costAtSale,
        })),
      });
    } catch (err) {
      const msg = err instanceof BadRequestException ? err.message : 'No se pudo registrar el pedido.';
      await this.txt(`❌ ${msg}\n\nRevisa tu carrito o escribe *menu* para ver otras opciones.`);
      return;
    }

    const summaryLines = cart.items.map((i) => `• ${i.quantity}x ${i.nombre}`).join('\n');
    const totalStr = cart.total.toFixed(2);

    await this.cart.clearCart(this.c.stateKey);
    await this.cartHold.release(this.c.stateKey);
    await this.chatSession.updateState(this.c.stateKey, ChatState.PEDIDO_CREADO, { cartJson: null });
    await this.chatSession.updateCustomerData(this.c.stateKey, {
      customerName: data.customerName,
      customerPhone: data.customerPhone,
    });

    await this.txt(
      `✅ ¡Pedido #${order.id.slice(0, 8)} registrado!\n\n` +
        '📋 *Resumen:*\n' +
        summaryLines +
        `\n💰 Total: S/ ${totalStr}\n\n` +
        '⏳ *Pendiente de aceptación* por un asesor. Las unidades quedan reservadas hasta que confirmemos tu pedido.\n\n' +
        'Te avisaremos cuando esté confirmado y en camino 🚚\n\n' +
        'Escribe *menu* para un nuevo pedido.',
    );
  }

  private async handoffHumano() {
    await this.chatSession.updateState(this.c.stateKey, ChatState.HANDOFF_HUMANO);
    const phone = this.c.contactPhone;
    const existing = phone ? await this.customers.findByPhone(phone) : null;

    if (existing) {
      await this.chatSession.updateCustomerData(this.c.stateKey, {
        customerName: existing.name,
        customerPhone: existing.phone,
      });
    } else if (phone) {
      await this.chatSession.updateCustomerData(this.c.stateKey, {
        customerPhone: phone,
      });
    }

    const nombre = existing?.name ? `, *${existing.name}*` : '';
    let msg = `👤 Hola${nombre}, un asesor humano te atenderá en breve.\n\n`;
    if (existing?.address) {
      msg += `📍 Tenemos tu dirección: ${existing.address}\n`;
      msg += 'Si cambió, indícasela al asesor.\n\n';
    }
    msg += 'Por favor espera. Cuéntale tu pedido y lo registrará por ti.';
    await this.txt(msg);

    void this.vendorNotify.notifyHandoffRequest({
      chatId: this.c.chatId,
      customerName: existing?.name ?? undefined,
      customerPhone: existing?.phone ?? phone ?? undefined,
      waSessionId: this.c.waSessionId,
    });
  }
}

function bodyTrim(text: string): string {
  return text.trim();
}
