import { BadRequestException, Body, Controller, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenwaService } from '../openwa/openwa.service';
import { OrdersService } from '../orders/orders.service';
import { CustomersService } from '../customers/customers.service';
import { CartService } from '../whatsapp-bot/cart.service';
import { CartHoldService } from '../inventory/cart-hold.service';
import { N8nToolAuthGuard } from './n8n-tool-auth.guard';
import { N8nSessionToolsService } from './n8n-session-tools.service';
import type { N8nFlowContext } from './n8n-flow.types';
import { parseWaConversationId } from '../whatsapp-inbox/wa-conversation.util';

type ChatOrderItem = { productId: string; quantity: number };

@ApiTags('n8n-tools')
@Controller('webhooks/n8n/tools')
@UseGuards(N8nToolAuthGuard)
export class N8nCommerceToolsController {
  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
    private openwa: OpenwaService,
    private customers: CustomersService,
    private cart: CartService,
    private cartHold: CartHoldService,
    private sessionTools: N8nSessionToolsService,
  ) {}

  @Post('categories.list')
  @ApiOperation({ summary: 'n8n tool: list active categories' })
  async listCategories() {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      include: { _count: { select: { products: true } } },
      orderBy: { orden: 'asc' },
    });
    return {
      categories: rows.map((row) => ({
        id: row.id,
        name: row.nombre,
        productCount: row._count.products,
      })),
    };
  }

  @Post('products.search')
  @ApiOperation({ summary: 'n8n tool: search active products' })
  async searchProducts(@Body() body: { query?: string; limit?: number }) {
    const query = body.query?.trim();
    const rows = await this.prisma.product.findMany({
      where: {
        isActive: true,
        stock: { gt: 0 },
        ...(query
          ? {
              OR: [
                { nombre: { contains: query, mode: 'insensitive' } },
                { descripcion: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { images: { orderBy: { orden: 'asc' } }, category: true },
      orderBy: { nombre: 'asc' },
      take: Math.min(body.limit ?? 10, 30),
    });
    return { products: rows.map((row) => this.productForChat(row)) };
  }

  @Post('products.by_category')
  @ApiOperation({ summary: 'n8n tool: list products by category' })
  async productsByCategory(@Body() body: { categoryId: string; limit?: number }) {
    const rows = await this.prisma.product.findMany({
      where: { categoryId: body.categoryId, isActive: true, stock: { gt: 0 } },
      include: { images: { orderBy: { orden: 'asc' } }, category: true },
      orderBy: { nombre: 'asc' },
      take: Math.min(body.limit ?? 20, 50),
    });
    return { products: rows.map((row) => this.productForChat(row)) };
  }

  @Post('catalog_pdf.active')
  @ApiOperation({ summary: 'n8n tool: get active catalog PDF' })
  async activeCatalogPdf() {
    const pdf = await this.prisma.catalogPdf.findFirst({ where: { isActive: true } });
    return pdf ? { available: true, id: pdf.id, url: pdf.url } : { available: false };
  }

  @Post('catalog_pdf.send')
  @ApiOperation({ summary: 'n8n tool: send active catalog PDF via WhatsApp' })
  async sendCatalogPdf(
    @Body() body: { chatId: string; waSessionId?: string; caption?: string },
  ) {
    if (!body.chatId?.trim()) throw new BadRequestException('chatId is required');
    const pdf = await this.prisma.catalogPdf.findFirst({ where: { isActive: true } });
    if (!pdf) return { available: false, sent: false };

    const waChatId = this.normalizeWaChatId(body.chatId);
    try {
      await this.openwa.sendDocument({
        chatId: waChatId,
        sessionId: body.waSessionId,
        document: { url: pdf.url, mimetype: 'application/pdf', filename: 'catalogo.pdf' },
        caption: body.caption?.trim() || '📋 Catálogo completo',
        source: 'bot',
      });
      return { available: true, sent: true, url: pdf.url };
    } catch (err: any) {
      return {
        available: true,
        sent: false,
        url: pdf.url,
        error: err?.message || String(err),
      };
    }
  }

  @Post('products.send_image')
  @ApiOperation({ summary: 'n8n tool: send primary product image via WhatsApp' })
  async sendProductImage(
    @Body() body: { chatId: string; waSessionId?: string; productId: string; caption?: string },
  ) {
    if (!body.chatId?.trim()) throw new BadRequestException('chatId is required');
    if (!body.productId?.trim()) throw new BadRequestException('productId is required');

    const product = await this.prisma.product.findUnique({
      where: { id: body.productId },
      include: { images: { orderBy: { orden: 'asc' }, take: 1 } },
    });
    if (!product?.images[0]?.url) return { sent: false, reason: 'no_image' };

    const waChatId = this.normalizeWaChatId(body.chatId);
    const caption =
      body.caption?.trim() ||
      `*${product.nombre}* — S/ ${Number(product.salePrice).toFixed(2)}`;

    await this.openwa.sendImage({
      chatId: waChatId,
      sessionId: body.waSessionId,
      image: { url: product.images[0].url },
      caption,
      source: 'bot',
    });

    return { sent: true, productId: product.id, url: product.images[0].url };
  }

  @Post('cart.get')
  @ApiOperation({ summary: 'n8n tool: get cart for a chat session' })
  async cartGet(@Body() body: { stateKey: string }) {
    if (!body.stateKey?.trim()) throw new BadRequestException('stateKey is required');
    const cart = await this.cart.getCart(body.stateKey);
    return {
      cart,
      reservedMinutes: Math.round(this.cart.getTtlSeconds() / 60),
    };
  }

  @Post('cart.add_item')
  @ApiOperation({ summary: 'n8n tool: add item to cart with hold sync' })
  async cartAddItem(
    @Body()
    body: {
      stateKey: string;
      chatId: string;
      contactPhone?: string;
      customerName?: string;
      productId: string;
      quantity: number;
    },
  ) {
    if (!body.stateKey?.trim()) throw new BadRequestException('stateKey is required');
    if (!body.productId?.trim()) throw new BadRequestException('productId is required');
    if (!Number.isInteger(body.quantity) || body.quantity <= 0) {
      throw new BadRequestException('quantity must be a positive integer');
    }

    const product = await this.prisma.product.findUnique({ where: { id: body.productId } });
    if (!product || !product.isActive) {
      throw new NotFoundException(`Producto no encontrado: ${body.productId}`);
    }

    const held = await this.cartHold.getHeldQuantity(body.productId, body.stateKey);
    const available = product.stock - held;
    if (body.quantity > available) {
      throw new BadRequestException(
        available <= 0 ? 'Producto sin stock disponible' : `Solo hay ${available} unidad(es) disponibles`,
      );
    }

    const cart = await this.cart.addItem(body.stateKey, {
      productId: product.id,
      nombre: product.nombre,
      quantity: body.quantity,
      unitPrice: Number(product.salePrice),
      costAtSale: Number(product.costPrice),
    });

    await this.cartHold.syncFromCart(body.stateKey, cart, {
      chatId: body.chatId,
      contactPhone: body.contactPhone ?? null,
      customerName: body.customerName ?? null,
    });

    return {
      cart,
      reservedMinutes: Math.round(this.cart.getTtlSeconds() / 60),
    };
  }

  @Post('cart.remove_item')
  @ApiOperation({ summary: 'n8n tool: remove item from cart' })
  async cartRemoveItem(
    @Body()
    body: {
      stateKey: string;
      chatId: string;
      contactPhone?: string;
      customerName?: string;
      productId: string;
    },
  ) {
    if (!body.stateKey?.trim()) throw new BadRequestException('stateKey is required');
    if (!body.productId?.trim()) throw new BadRequestException('productId is required');

    const cart = await this.cart.removeItem(body.stateKey, body.productId);
    await this.cartHold.syncFromCart(body.stateKey, cart, {
      chatId: body.chatId,
      contactPhone: body.contactPhone ?? null,
      customerName: body.customerName ?? null,
    });

    return {
      cart,
      reservedMinutes: Math.round(this.cart.getTtlSeconds() / 60),
    };
  }

  @Post('cart.clear')
  @ApiOperation({ summary: 'n8n tool: clear cart and release hold' })
  async cartClear(@Body() body: { stateKey: string }) {
    if (!body.stateKey?.trim()) throw new BadRequestException('stateKey is required');
    await this.cart.clearCart(body.stateKey);
    await this.cartHold.release(body.stateKey);
    return { ok: true };
  }

  @Post('customers.lookup')
  @ApiOperation({ summary: 'n8n tool: lookup customer by phone' })
  async customersLookup(@Body() body: { phone: string }) {
    return this.sessionTools.lookupCustomer(body.phone);
  }

  @Post('orders.find_active_by_phone')
  @ApiOperation({ summary: 'n8n tool: find active order by customer phone' })
  async findActiveOrderByPhone(@Body() body: { customerPhone: string }) {
    return this.sessionTools.findActiveOrderByPhone(body.customerPhone);
  }

  @Post('chat.bootstrap')
  @ApiOperation({ summary: 'n8n tool: bootstrap chat session context' })
  async chatBootstrap(
    @Body()
    body: { chatId: string; stateKey: string; contactPhone?: string | null },
  ) {
    if (!body.chatId?.trim()) throw new BadRequestException('chatId is required');
    if (!body.stateKey?.trim()) throw new BadRequestException('stateKey is required');
    return this.sessionTools.bootstrap(body);
  }

  @Post('chat.session.patch')
  @ApiOperation({ summary: 'n8n tool: patch n8n flow context' })
  async chatSessionPatch(@Body() body: { chatId: string; flow: Partial<N8nFlowContext> }) {
    if (!body.chatId?.trim()) throw new BadRequestException('chatId is required');
    const flow = await this.sessionTools.patchFlow(body.chatId, body.flow ?? {});
    return { flow };
  }

  @Post('chat.handoff')
  @ApiOperation({ summary: 'n8n tool: handoff to human agent' })
  async chatHandoff(
    @Body()
    body: {
      chatId: string;
      contactPhone?: string | null;
      customerName?: string | null;
      waSessionId?: string;
    },
  ) {
    if (!body.chatId?.trim()) throw new BadRequestException('chatId is required');
    return this.sessionTools.handoff(body.chatId, body);
  }

  @Post('chat.resume_bot')
  @ApiOperation({ summary: 'n8n tool: resume bot after handoff' })
  async chatResumeBot(@Body() body: { chatId: string }) {
    if (!body.chatId?.trim()) throw new BadRequestException('chatId is required');
    return this.sessionTools.resumeBot(body.chatId);
  }

  @Post('orders.create_from_chat')
  @ApiOperation({ summary: 'n8n tool: create WhatsApp order from chat' })
  async createOrderFromChat(
    @Body()
    body: {
      chatId: string;
      waSessionId?: string;
      customerName: string;
      customerPhone: string;
      address?: string;
      reference?: string;
      notes?: string;
      items: ChatOrderItem[];
    },
  ) {
    this.validateCreateOrderBody(body);
    const items = await Promise.all(
      body.items.map(async (item) => {
        const product = await this.prisma.product.findUnique({ where: { id: item.productId } });
        if (!product || !product.isActive) {
          throw new NotFoundException(`Producto no encontrado: ${item.productId}`);
        }
        return {
          productId: product.id,
          quantity: item.quantity,
          unitPrice: Number(product.salePrice),
          costAtSale: Number(product.costPrice),
        };
      }),
    );

    const customer = await this.customers.upsertFromOrder({
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      address: body.address,
      reference: body.reference,
    });

    const order = await this.orders.create({
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      address: body.address,
      reference: body.reference,
      customerId: customer.id,
      notes: body.notes,
      chatId: this.orderChatIdFromBody(body),
      source: 'WHATSAPP',
      items,
    });
    return { orderId: order.id, status: order.status, total: Number(order.total) };
  }

  @Post('orders.find_by_phone')
  @ApiOperation({ summary: 'n8n tool: find recent orders by customer phone' })
  async findOrdersByPhone(@Body() body: { customerPhone: string; limit?: number }) {
    const phone = body.customerPhone?.replace(/\D/g, '') ?? '';
    if (phone.length < 8) throw new BadRequestException('customerPhone is required');
    const rows = await this.prisma.order.findMany({
      where: { customerPhone: { contains: phone.slice(-9) } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(body.limit ?? 5, 10),
      include: { items: { include: { product: true } } },
    });
    return {
      orders: rows.map((order) => ({
        id: order.id,
        shortId: order.id.slice(0, 8),
        status: order.status,
        total: Number(order.total),
        createdAt: order.createdAt,
        items: order.items.map((item) => ({
          productName: item.product?.nombre ?? 'Producto',
          quantity: item.quantity,
        })),
      })),
    };
  }

  @Post('orders.get_status')
  @ApiOperation({ summary: 'n8n tool: get order status by id or short id' })
  async getOrderStatus(@Body() body: { orderId: string; customerPhone?: string }) {
    if (!body.orderId?.trim()) throw new BadRequestException('orderId is required');
    const order = await this.findOrderByIdOrShortId(body.orderId, body.customerPhone);
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return {
      id: order.id,
      shortId: order.id.slice(0, 8),
      status: order.status,
      total: Number(order.total),
      customerPhone: order.customerPhone,
      createdAt: order.createdAt,
      items: order.items.map((item) => ({
        productName: item.product?.nombre ?? 'Producto',
        quantity: item.quantity,
      })),
    };
  }

  @Post('orders.update_status')
  @ApiOperation({ summary: 'n8n tool: update order status through OrdersService' })
  async updateOrderStatus(@Body() body: { orderId: string; status: OrderStatus; note?: string }) {
    if (!body.orderId?.trim()) throw new BadRequestException('orderId is required');
    if (!this.isOrderStatus(body.status)) throw new BadRequestException('Invalid order status');
    const updated = await this.orders.updateStatus(body.orderId, {
      status: body.status,
      notes: body.note,
    });
    return { orderId: updated.id, status: updated.status };
  }

  @Post('messages.send_text')
  @ApiOperation({ summary: 'n8n tool: send WhatsApp text through Zent/OpenWA' })
  async sendText(@Body() body: { chatId: string; text: string; sessionId?: string }) {
    await this.openwa.sendText({ chatId: body.chatId, text: body.text, sessionId: body.sessionId });
    return { ok: true };
  }

  private normalizeWaChatId(chatId: string): string {
    return parseWaConversationId(chatId.trim()).waChatId;
  }

  private orderChatIdFromBody(body: { chatId: string; waSessionId?: string }): string {
    const waChatId = this.normalizeWaChatId(body.chatId);
    const sessionId = body.waSessionId?.trim();
    return sessionId ? `${sessionId}::${waChatId}` : waChatId;
  }

  private productForChat(row: {
    id: string;
    nombre: string;
    descripcion: string | null;
    salePrice: unknown;
    stock: number;
    minStock: number;
    category?: { nombre: string } | null;
    images?: { url: string }[];
  }) {
    return {
      id: row.id,
      name: row.nombre,
      description: row.descripcion,
      price: Number(row.salePrice),
      stock: row.stock,
      minStock: row.minStock,
      lowStock: row.stock <= row.minStock,
      category: row.category?.nombre ?? null,
      imageUrl: row.images?.[0]?.url ?? null,
    };
  }

  private validateCreateOrderBody(body: {
    chatId?: string;
    customerName?: string;
    customerPhone?: string;
    items?: ChatOrderItem[];
  }) {
    if (!body.chatId?.trim()) throw new BadRequestException('chatId is required');
    if (!body.customerName?.trim()) throw new BadRequestException('customerName is required');
    if (!body.customerPhone?.trim()) throw new BadRequestException('customerPhone is required');
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new BadRequestException('items are required');
    }
    for (const item of body.items) {
      if (!item.productId?.trim()) throw new BadRequestException('productId is required');
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException('quantity must be a positive integer');
      }
    }
  }

  private isOrderStatus(status: unknown): status is OrderStatus {
    return (
      status === 'NUEVO' ||
      status === 'EN_GESTION' ||
      status === 'CONFIRMADO' ||
      status === 'EN_DELIVERY' ||
      status === 'COMPLETADO' ||
      status === 'CANCELADO'
    );
  }

  private async findOrderByIdOrShortId(orderId: string, customerPhone?: string) {
    const phone = customerPhone?.replace(/\D/g, '');
    return this.prisma.order.findFirst({
      where: {
        id: orderId.length >= 8 ? { startsWith: orderId } : orderId,
        ...(phone && phone.length >= 8 ? { customerPhone: { contains: phone.slice(-9) } } : {}),
      },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
