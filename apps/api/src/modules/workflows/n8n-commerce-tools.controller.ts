import { BadRequestException, Body, Controller, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenwaService } from '../openwa/openwa.service';
import { OrdersService } from '../orders/orders.service';
import { N8nToolAuthGuard } from './n8n-tool-auth.guard';

type ChatOrderItem = { productId: string; quantity: number };

@ApiTags('n8n-tools')
@Controller('webhooks/n8n/tools')
@UseGuards(N8nToolAuthGuard)
export class N8nCommerceToolsController {
  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
    private openwa: OpenwaService,
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

  @Post('orders.create_from_chat')
  @ApiOperation({ summary: 'n8n tool: create WhatsApp order from chat' })
  async createOrderFromChat(
    @Body()
    body: {
      chatId: string;
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

    const order = await this.orders.create({
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      address: body.address,
      reference: body.reference,
      notes: body.notes,
      chatId: body.chatId,
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

  private productForChat(row: any) {
    return {
      id: row.id,
      name: row.nombre,
      description: row.descripcion,
      price: Number(row.salePrice),
      stock: row.stock,
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
