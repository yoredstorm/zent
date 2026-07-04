import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { BotCatalogContextService } from './bot-catalog-context.service';

export const BOT_AI_VARIABLES = [
  { key: 'storeName', label: 'Nombre de la tienda', description: 'Nombre comercial configurado' },
  { key: 'currency', label: 'Moneda', description: 'Código de moneda (ej. PEN)' },
  { key: 'deliveryFee', label: 'Costo de delivery', description: 'Tarifa plana de envío si aplica' },
  { key: 'businessDescription', label: 'Descripción del negocio', description: 'Qué vende la tienda' },
  { key: 'policies', label: 'Políticas', description: 'Envíos, pagos, devoluciones' },
  { key: 'paymentMethods', label: 'Formas de pago', description: 'Métodos activos para cobrar pedidos' },
  { key: 'orderStatuses', label: 'Estados de pedido', description: 'Estados disponibles y significado para cliente' },
  { key: 'workflowPolicies', label: 'Automatizaciones', description: 'Reglas activas de n8n para pagos y delivery' },
  { key: 'catalogSummary', label: 'Resumen de catálogo', description: 'Productos disponibles con stock' },
  { key: 'customerName', label: 'Nombre del cliente', description: 'Si está registrado' },
  { key: 'customerPhone', label: 'Teléfono del cliente', description: 'Número de WhatsApp' },
] as const;

export const DEFAULT_PLAYBOOK = `Eres el asistente de ventas por WhatsApp de {{storeName}}.

## Tu rol
- Ayudas a clientes a explorar el catálogo, armar pedidos y confirmar compras.
- Respondes en español, tono amable y conciso (mensajes cortos, aptos para WhatsApp).
- Usa emojis con moderación.

## Negocio
{{businessDescription}}

## Políticas
{{policies}}

## Formas de pago
{{paymentMethods}}

## Estados de pedido
{{orderStatuses}}

## Automatizaciones
{{workflowPolicies}}

## Catálogo actual (productos con stock)
{{catalogSummary}}

## Reglas operativas
- Moneda: {{currency}}. Precios en catálogo usan S/ como referencia visual.
- Delivery: {{deliveryFee}}
- NUNCA presentes menús numerados (1, 2, 3). Usa lenguaje natural y preguntas abiertas.
- Si el cliente saluda, preséntate y pregunta en qué puedes ayudar con el catálogo.
- Para mostrar productos, usa search_products o list_categories y describe opciones en prosa.
- Usa las herramientas (tools) para buscar productos, gestionar carrito y crear pedidos. No inventes productos ni precios.
- Si el cliente pide hablar con una persona, usa handoff_to_human.
- Comandos globales del usuario: *menu* (reiniciar), *asesor* (humano), *RETOMAR* (volver al asistente tras handoff).
- Antes de crear un pedido, usa get_checkout_draft, save_checkout_field y confirm_order; luego submit_order.
- Confirma resumen (productos, delivery, total) y pide confirmación explícita del cliente.
- Si no hay stock suficiente, informa con claridad y sugiere alternativas del catálogo.
- Cuando el cliente diga "agregar N", "añadir N" o un número tras ver un producto, usa add_to_cart con el productId del último get_product_details y quantity=N. Confirma siempre con resumen del carrito.
- Si el cliente pregunta por formas de pago, usa get_payment_methods.
- Si el cliente pregunta por su pedido, usa find_customer_orders o get_order_status.
- Si el cliente envía una referencia o comprobante de pago, usa submit_payment_reference.
- Nunca confirmes pago como validado si no existe respuesta explícita de backend o n8n.

## Cliente actual
- Nombre: {{customerName}}
- Teléfono: {{customerPhone}}`;

export interface PromptContext {
  customerName?: string | null;
  customerPhone?: string | null;
}

@Injectable()
export class BotAiPromptService {
  constructor(
    private prisma: PrismaService,
    private catalog: BotCatalogContextService,
    private config: ConfigService,
  ) {}

  interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
  }

  async buildSystemPrompt(ctx: PromptContext = {}): Promise<string> {
    const store = await this.prisma.storeSettings.findFirst();
    const catalogSummary = await this.catalog.getCatalogSummary();
    const deliveryFee =
      store?.deliveryFlatFee != null
        ? `S/ ${Number(store.deliveryFlatFee).toFixed(2)}`
        : 'consultar con asesor';

    const vars: Record<string, string> = {
      storeName: store?.storeName ?? this.config.get('STORE_NAME', 'Zent'),
      currency: store?.currency ?? 'PEN',
      deliveryFee,
      businessDescription:
        store?.botAiBusinessDescription?.trim() ||
        'Tienda en línea con catálogo de productos disponibles por WhatsApp.',
      policies:
        store?.botAiPolicies?.trim() ||
        'Pagos y entregas se coordinan con un asesor tras confirmar el pedido.',
      paymentMethods:
        this.config.get<string>('BOT_AI_PAYMENT_METHODS', '').trim() ||
        'Transferencia, Yape/Plin o pago contra entrega, según disponibilidad del vendedor.',
      orderStatuses:
        this.config.get<string>('BOT_AI_ORDER_STATUSES', '').trim() ||
        'NUEVO: recibido; EN_GESTION: en revisión; CONFIRMADO: confirmado; EN_DELIVERY: en reparto; COMPLETADO: entregado; CANCELADO: cancelado.',
      workflowPolicies:
        this.config.get<string>('BOT_AI_WORKFLOW_POLICIES', '').trim() ||
        'Si el cliente envía referencia de pago, registra la referencia y espera validación del vendedor o automatización.',
      catalogSummary,
      customerName: ctx.customerName?.trim() || 'No registrado',
      customerPhone: ctx.customerPhone?.trim() || 'No detectado',
    };

    const playbook = store?.botAiPlaybook?.trim() || DEFAULT_PLAYBOOK;
    return this.interpolate(playbook, vars);
  }

  listVariables() {
    return BOT_AI_VARIABLES;
  }
}
