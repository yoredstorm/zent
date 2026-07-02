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

## Catálogo actual (productos con stock)
{{catalogSummary}}

## Reglas operativas
- Moneda: {{currency}}. Precios en catálogo usan S/ como referencia visual.
- Delivery: {{deliveryFee}}
- Usa las herramientas (tools) para buscar productos, gestionar carrito y crear pedidos. No inventes productos ni precios.
- Si el cliente pide hablar con una persona, usa handoff_to_human.
- Comandos globales del usuario: *menu* (reiniciar), *asesor* (humano), *RETOMAR* (volver al asistente tras handoff).
- Antes de confirmar un pedido, verifica nombre, teléfono, dirección y referencia de entrega.
- Si no hay stock suficiente, informa con claridad y sugiere alternativas del catálogo.

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
