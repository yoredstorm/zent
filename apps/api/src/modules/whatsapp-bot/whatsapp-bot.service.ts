import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsyncLocalStorage } from 'async_hooks';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenwaService } from '../openwa/openwa.service';
import { CartService } from './cart.service';
import { ChatSessionService } from './chat-session.service';
import { CustomersService, normalizePhone } from '../customers/customers.service';
import { formatPhoneDisplay, resolvePhoneFromIds } from './wa-contact.util';
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
    private config: ConfigService,
  ) {}

  private get storeName(): string {
    return this.config.get('STORE_NAME', 'Zent').trim() || 'Zent';
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
    const session = await this.chatSession.getOrCreate(this.c.stateKey);
    const text = body.trim().toLowerCase();

    if (text === 'asesor' || text === 'humano' || text === 'agente') {
      await this.handoffHumano();
      return;
    }

    const greetings = ['hola', 'buenas', 'buenos dias', 'buenos días', 'hi', 'hello', 'ola'];
    if (greetings.includes(text) || text === 'menu' || text === 'inicio' || text === '0') {
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

  private async showMainMenu() {
    await this.chatSession.updateState(this.c.stateKey, ChatState.MENU_PRINCIPAL);
    const text =
      `¡Hola! 👋 Bienvenido a *${this.storeName}*.\n\n` +
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

  private async mostrarCategorias() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      include: { products: { where: { isActive: true, stock: { gt: 0 } } } },
      orderBy: { orden: 'asc' },
    });

    const withProducts = categories.filter((c) => c.products.length > 0);
    if (withProducts.length === 0) {
      await this.txt('No hay productos disponibles en este momento.');
      await this.showMainMenu();
      return;
    }

    let msg = '📂 *Categorías disponibles:*\n\n';
    withProducts.forEach((cat, i) => {
      msg += `${i + 1}️⃣ ${cat.nombre} (${cat.products.length} productos)\n`;
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
      include: { products: { where: { isActive: true, stock: { gt: 0 } } } },
      orderBy: { orden: 'asc' },
    });

    const withProducts = categories.filter((c) => c.products.length > 0);
    const index = parseInt(text) - 1;

    if (isNaN(index) || index < 0 || index >= withProducts.length) {
      await this.txt('Opción inválida. Escribe el número de la categoría:');
      return;
    }

    await this.mostrarProductosCategoria(withProducts[index].id);
  }

  private async mostrarProductosCategoria(categoryId: string) {
    const products = await this.prisma.product.findMany({
      where: { categoryId, isActive: true, stock: { gt: 0 } },
      orderBy: { nombre: 'asc' },
    });

    if (products.length === 0) {
      await this.txt('No hay productos disponibles en esta categoría.');
      await this.mostrarCategorias();
      return;
    }

    const browseCtx: BrowseContext = {
      categoryId,
      productIds: products.map((p) => p.id),
    };
    await this.chatSession.updateContext(this.c.stateKey, browseCtx);
    await this.chatSession.updateState(this.c.stateKey, ChatState.LISTADO_PRODUCTOS);

    let msg = '📦 *Productos disponibles:*\n\n';
    products.forEach((p, i) => {
      msg += `${i + 1}. ${p.nombre} — S/ ${p.salePrice}${this.lowStockHint(p.stock, p.minStock)}\n`;
    });
    msg +=
      '\n*Comandos:*\n' +
      '• *ver [número]* — ver foto y detalle\n' +
      '• *agregar [número] [cantidad]* — agregar al carrito\n' +
      '• *carrito* — ver tu pedido\n' +
      '• *categorias* — cambiar categoría\n' +
      '• *menu* — inicio';

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

    const ctx = await this.getBrowseContext();
    if (!ctx) {
      await this.mostrarCategorias();
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

    await this.txt(
      'Comando no reconocido.\n\n' +
        '• *ver 1* — ver producto\n' +
        '• *agregar 1 2* — agregar 2 unidades\n' +
        '• *carrito* — ver pedido',
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

    const caption =
      `*${product.nombre}*\n` +
      `💰 Precio: S/ ${product.salePrice}\n` +
      (product.stock <= product.minStock ? `⚠️ *¡Quedan pocas unidades!*\n` : '') +
      (product.descripcion ? `📝 ${product.descripcion}\n` : '') +
      `\nPara agregar: *agregar ${index + 1} [cantidad]*`;

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
    if (product.stock < quantity) {
      await this.txt(`Solo hay ${product.stock} unidades disponibles.`);
      return;
    }

    await this.cart.addItem(this.c.stateKey, {
      productId: product.id,
      nombre: product.nombre,
      quantity,
      unitPrice: Number(product.salePrice),
      costAtSale: Number(product.costPrice),
    });

    await this.txt(
      `✅ Agregado: ${quantity}x ${product.nombre}\n\n` +
        'Sigue agregando o escribe *carrito* para ver tu pedido.',
    );
  }

  private async mostrarCarrito() {
    const cart = await this.cart.getCart(this.c.stateKey);
    if (cart.items.length === 0) {
      await this.txt('🛒 Tu carrito está vacío.\n\nEscribe *menu* para ver productos.');
      await this.showMainMenu();
      return;
    }

    let text = '🛒 *Tu carrito:*\n\n';
    cart.items.forEach((item, i) => {
      text += `${i + 1}. ${item.nombre}\n   ${item.quantity}x S/ ${item.unitPrice} = S/ ${(item.quantity * item.unitPrice).toFixed(2)}\n\n`;
    });
    text += `💰 *Total: S/ ${cart.total.toFixed(2)}*\n\n`;
    text += 'Opciones:\n';
    text += '✅ *confirmar* — Finalizar pedido\n';
    text += '❌ *eliminar [número]* — Quitar producto\n';
    text += '🔄 *menu* — Seguir comprando';

    await this.chatSession.updateState(this.c.stateKey, ChatState.CARRITO);
    await this.txt(text);
  }

  private async handleCarrito(text: string) {
    if (text === 'confirmar' || text === 'finalizar') {
      await this.confirmarPedido();
    } else if (text.startsWith('eliminar ')) {
      const index = parseInt(text.split(' ')[1]) - 1;
      const cart = await this.cart.getCart(this.c.stateKey);
      if (index >= 0 && index < cart.items.length) {
        await this.cart.removeItem(this.c.stateKey, cart.items[index].productId);
        await this.txt('✅ Producto eliminado');
        await this.mostrarCarrito();
      }
    } else if (text === 'menu') {
      await this.showMainMenu();
    } else {
      await this.mostrarCarrito();
    }
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
    text += '¿Confirmas este pedido? Escribe *si* para continuar o *carrito* para modificar.';

    await this.chatSession.updateState(this.c.stateKey, ChatState.CONFIRMAR_PEDIDO);
    await this.txt(text);
  }

  private async handleConfirmarPedido(text: string) {
    if (text === 'si' || text === 'sí' || text === 'confirmar') {
      await this.iniciarDatosEntrega();
    } else if (text === 'carrito') {
      await this.mostrarCarrito();
    } else {
      await this.txt('Escribe *si* para confirmar o *carrito* para modificar.');
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
        `Hola ${existing.name}, tenemos tus datos guardados:\n\n` +
          `📍 Dirección: ${existing.address}\n` +
          `📞 Teléfono: ${existing.phone}\n` +
          `📌 Referencia: ${existing.reference || 'N/A'}\n\n` +
          '¿Confirmas estos datos?\n' +
          '1 — Sí, usar los mismos\n' +
          '2 — Cambiar dirección/referencia\n' +
          '3 — Cambiar todo',
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
        await this.txt('Escribe 1, 2 o 3 para elegir una opción.');
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
    const customer = await this.customers.upsertFromOrder(data);

    const order = await this.prisma.order.create({
      data: {
        customerId: customer.id,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        address: data.address,
        reference: data.reference,
        chatId: this.c.chatId,
        subtotal: cart.subtotal,
        total: cart.total,
        source: 'WHATSAPP',
        status: 'NUEVO',
        items: {
          create: cart.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            costAtSale: item.costAtSale,
          })),
        },
      },
    });

    for (const item of cart.items) {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
      const newStock = (product?.stock ?? 0) - item.quantity;
      await this.prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: { decrement: item.quantity },
          isOutOfStock: newStock <= 0,
        },
      });
      await this.prisma.inventoryMovement.create({
        data: {
          productId: item.productId,
          type: 'OUT',
          quantity: item.quantity,
          reason: `Pedido WhatsApp ${order.id}`,
          orderId: order.id,
        },
      });
    }

    const summaryLines = cart.items.map((i) => `• ${i.quantity}x ${i.nombre}`).join('\n');
    const totalStr = cart.total.toFixed(2);

    await this.cart.clearCart(this.c.stateKey);
    await this.chatSession.updateState(this.c.stateKey, ChatState.PEDIDO_CREADO, { cartJson: null });
    await this.chatSession.updateCustomerData(this.c.stateKey, {
      customerName: data.customerName,
      customerPhone: data.customerPhone,
    });

    await this.txt(
      `✅ ¡Pedido #${order.id.slice(0, 8)} registrado!\n\n` +
        '📋 *Resumen final:*\n' +
        summaryLines +
        `\n💰 Total: S/ ${totalStr}\n\n` +
        'Un asesor te contactará pronto para coordinar el envío 🚚\n\n' +
        'Gracias por tu compra 🙏\n\nEscribe *menu* para un nuevo pedido.',
    );
  }

  private async handoffHumano() {
    await this.chatSession.updateState(this.c.stateKey, ChatState.HANDOFF_HUMANO);
    await this.txt('👤 Un asesor humano te atenderá en breve. Por favor espera.');
  }
}

function bodyTrim(text: string): string {
  return text.trim();
}
