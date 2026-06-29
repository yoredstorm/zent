import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenwaService } from '../openwa/openwa.service';
import { CartService } from './cart.service';
import { ChatSessionService } from './chat-session.service';
import { ChatState } from '@prisma/client';

interface BotContext {
  chatId: string;
  stateKey: string;
  waSessionId?: string;
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
  ) {}

  async handleMessage(chatId: string, body: string, from: string, waSessionId?: string) {
    const stateKey = waSessionId ? `${waSessionId}::${chatId}` : chatId;
    return this.ctx.run({ chatId, stateKey, waSessionId }, () =>
      this.processMessage(body, from),
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

  private async processMessage(body: string, from: string) {
    const session = await this.chatSession.getOrCreate(this.c.stateKey);
    const text = body.trim().toLowerCase();

    if (text === 'asesor' || text === 'humano' || text === 'agente') {
      await this.handoffHumano();
      return;
    }

    if (text === 'menu' || text === 'inicio' || text === '0') {
      await this.showMainMenu();
      return;
    }

    switch (session.state) {
      case ChatState.MENU_PRINCIPAL:
        await this.handleMenuPrincipal(text);
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
        await this.handleDatosEntrega(text, from);
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
    const text = `¡Hola! 👋 Bienvenido a nuestra tienda.\n\n¿Qué deseas hacer?\n\n1️⃣ Ver catálogo completo (PDF)\n2️⃣ Ver productos por categoría\n3️⃣ Ver mi carrito\n4️⃣ Hablar con un asesor\n\nEscribe el número de tu opción:`;
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
      await this.showMainMenu();
    }
  }

  private async enviarCatalogoPDF() {
    const pdf = await this.prisma.catalogPdf.findFirst({ where: { isActive: true } });
    if (pdf) {
      await this.doc(
        { url: pdf.url, mimetype: 'application/pdf' },
        '📋 Aquí tienes nuestro catálogo completo',
      );
    } else {
      await this.txt('Lo sentimos, el catálogo PDF no está disponible en este momento.');
    }
    await this.showMainMenu();
  }

  private async mostrarCategorias() {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      include: { products: { where: { isActive: true, stock: { gt: 0 } } } },
      orderBy: { orden: 'asc' },
    });

    const withProducts = categories.filter(c => c.products.length > 0);
    if (withProducts.length === 0) {
      await this.txt('No hay productos disponibles en este momento.');
      await this.showMainMenu();
      return;
    }

    let text = '📂 *Categorías disponibles:*\n\n';
    withProducts.forEach((cat, i) => {
      text += `${i + 1}️⃣ ${cat.nombre} (${cat.products.length} productos)\n`;
    });
    text += '\nEscribe el número de la categoría:';

    await this.chatSession.updateState(this.c.stateKey, ChatState.SELECCION_CATEGORIA);
    await this.txt(text);
  }

  private async handleSeleccionCategoria(text: string) {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      include: { products: { where: { isActive: true, stock: { gt: 0 } } } },
      orderBy: { orden: 'asc' },
    });

    const withProducts = categories.filter(c => c.products.length > 0);
    const index = parseInt(text) - 1;

    if (isNaN(index) || index < 0 || index >= withProducts.length) {
      await this.txt('Opción inválida. Escribe el número de la categoría:');
      return;
    }

    const category = withProducts[index];
    await this.mostrarProductosCategoria(category.id);
  }

  private async mostrarProductosCategoria(categoryId: string) {
    const products = await this.prisma.product.findMany({
      where: { categoryId, isActive: true, stock: { gt: 0 } },
      include: { images: { orderBy: { orden: 'asc' } } },
    });

    if (products.length === 0) {
      await this.txt('No hay productos disponibles en esta categoría.');
      await this.showMainMenu();
      return;
    }

    await this.chatSession.updateState(this.c.stateKey, ChatState.LISTADO_PRODUCTOS);

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const text = `*${i + 1}. ${p.nombre}*\n💰 Precio: S/ ${p.salePrice}\n📦 Stock: ${p.stock}\n\nPara agregar al carrito escribe: *agregar ${i + 1} [cantidad]*\nEjemplo: agregar 1 2`;

      if (p.images.length > 0) {
        await this.img({ url: p.images[0].url }, text);
      } else {
        await this.txt(text);
      }
    }

    await this.txt(
      '✅ Para agregar un producto: *agregar [número] [cantidad]*\n🛒 Para ver carrito: *carrito*\n⬅️ Para volver: *menu*',
    );
  }

  private async handleListadoProductos(text: string) {
    if (text === 'carrito' || text === 'ver carrito') {
      await this.mostrarCarrito();
      return;
    }

    if (text.startsWith('agregar ')) {
      const parts = text.split(' ');
      const productIndex = parseInt(parts[1]) - 1;
      const quantity = parseInt(parts[2]) || 1;

      const products = await this.prisma.product.findMany({
        where: { isActive: true, stock: { gt: 0 } },
        orderBy: { nombre: 'asc' },
      });

      if (isNaN(productIndex) || productIndex < 0 || productIndex >= products.length) {
        await this.txt('Número de producto inválido.');
        return;
      }

      const product = products[productIndex];
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
        `✅ Agregado: ${quantity}x ${product.nombre}\n\nEscribe *carrito* para ver tu pedido o sigue agregando productos.`,
      );
    }
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
    text += '✅ *confirmar* - Finalizar pedido\n';
    text += '❌ *eliminar [número]* - Quitar producto\n';
    text += '🔄 *menu* - Seguir comprando';

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
    cart.items.forEach(item => {
      text += `${item.quantity}x ${item.nombre} - S/ ${(item.quantity * item.unitPrice).toFixed(2)}\n`;
    });
    text += `\n💰 *Total: S/ ${cart.total.toFixed(2)}*\n\n`;
    text += '¿Confirmas este pedido? Escribe *si* para continuar.';

    await this.chatSession.updateState(this.c.stateKey, ChatState.CONFIRMAR_PEDIDO);
    await this.txt(text);
  }

  private async handleConfirmarPedido(text: string) {
    if (text === 'si' || text === 'sí' || text === 'confirmar') {
      await this.chatSession.updateState(this.c.stateKey, ChatState.DATOS_ENTREGA);
      await this.txt('📝 Para completar tu pedido necesito algunos datos:\n\n1️⃣ *Nombre completo:*');
    } else {
      await this.mostrarCarrito();
    }
  }

  private async handleDatosEntrega(text: string, from: string) {
    const session = await this.chatSession.getOrCreate(this.c.stateKey);
    const sessionData = session.cartJson ? JSON.parse(session.cartJson) : { step: 0 };

    if (sessionData.step === 0) {
      sessionData.customerName = text;
      sessionData.step = 1;
      await this.chatSession.updateState(this.c.stateKey, ChatState.DATOS_ENTREGA, { cartJson: JSON.stringify(sessionData) });
      await this.txt('2️⃣ *Dirección de entrega:*');
    } else if (sessionData.step === 1) {
      sessionData.address = text;
      sessionData.step = 2;
      await this.chatSession.updateState(this.c.stateKey, ChatState.DATOS_ENTREGA, { cartJson: JSON.stringify(sessionData) });
      await this.txt(`3️⃣ *Teléfono de contacto:* (o escribe "mismo" para usar ${from})`);
    } else if (sessionData.step === 2) {
      sessionData.customerPhone = text === 'mismo' ? from : text;
      sessionData.step = 3;
      await this.chatSession.updateState(this.c.stateKey, ChatState.DATOS_ENTREGA, { cartJson: JSON.stringify(sessionData) });
      await this.txt('4️⃣ *Referencia del lugar:* (calle, edificio, color de casa, etc.)');
    } else if (sessionData.step === 3) {
      sessionData.reference = text;
      await this.crearPedido(sessionData);
    }
  }

  private async crearPedido(data: any) {
    const cart = await this.cart.getCart(this.c.stateKey);

    const order = await this.prisma.order.create({
      data: {
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        address: data.address,
        reference: data.reference,
        subtotal: cart.subtotal,
        total: cart.total,
        source: 'WHATSAPP',
        status: 'NUEVO',
        items: {
          create: cart.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            costAtSale: item.costAtSale,
          })),
        },
      },
    });

    for (const item of cart.items) {
      await this.prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: { decrement: item.quantity },
          isOutOfStock: true,
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

    await this.cart.clearCart(this.c.stateKey);
    await this.chatSession.updateState(this.c.stateKey, ChatState.PEDIDO_CREADO, { cartJson: null });

    await this.txt(
      `✅ ¡Pedido #${order.id.slice(0, 8)} registrado!\n\nUn asesor te contactará pronto para coordinar el envío 🚚\n\nGracias por tu compra 🙏`,
    );
  }

  private async handoffHumano() {
    await this.chatSession.updateState(this.c.stateKey, ChatState.HANDOFF_HUMANO);
    await this.txt('👤 Un asesor humano te atenderá en breve. Por favor espera.');
  }
}