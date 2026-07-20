import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { createNovitaClient } from '../bot-ai/novita.client';

export interface ComposeReplyInput {
  datosIA: Record<string, unknown>;
  mensajeUsuario?: string;
  fase?: string;
  cliente?: { found: boolean; name?: string | null } | null;
}

/**
 * Redacta el mensaje final del modo hibrido "n8n + IA": recibe los hechos ya
 * decididos por el orquestador de n8n (producto, carrito, cliente, etc.) y
 * SOLO los parafrasea de forma natural — nunca decide precios, stock ni
 * confirma pedidos. Si Novita falla, n8n conserva el texto canon (fail-soft).
 */
@Injectable()
export class N8nAiComposerService {
  private readonly logger = new Logger(N8nAiComposerService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async composeReply(input: ComposeReplyInput): Promise<{ reply: string } | null> {
    const apiKey = this.config.get<string>('NOVITA_API_KEY', '').trim();
    if (!apiKey) {
      this.logger.warn('ai.compose_reply: NOVITA_API_KEY no configurada');
      return null;
    }

    const store = await this.prisma.storeSettings.findFirst();
    const storeName = store?.storeName?.trim() || this.config.get<string>('STORE_NAME', 'Zent');
    const businessDescription =
      store?.botAiBusinessDescription?.trim() ||
      'Tienda en línea con catálogo de productos disponibles por WhatsApp.';
    const policies =
      store?.botAiPolicies?.trim() ||
      'Pagos y entregas se coordinan con un asesor tras confirmar el pedido.';

    const esSaludo = (input.datosIA as { tipo?: string } | undefined)?.tipo === 'saludo';

    const systemPrompt = [
      `Eres ${storeName}, redactando UN mensaje de WhatsApp para un cliente. Tono amable, natural, como una persona de confianza — nunca como un menú o un bot.`,
      `Negocio: ${businessDescription}`,
      `Políticas: ${policies}`,
      'Reglas estrictas:',
      '- Usa SOLO los hechos en "Datos" para redactar. Nunca inventes productos, precios, stock, direcciones, IDs de pedido ni políticas que no estén ahí.',
      '- No los repitas como una lista técnica; redáctalos en prosa cálida y breve (2 a 5 líneas, apto para WhatsApp).',
      '- Nunca uses menús numerados (1, 2, 3...).',
      '- Si "Datos" incluye "siguientePaso", tu mensaje DEBE terminar comunicando esa acción concreta de forma natural (parafraséala con tus palabras, pero no la omitas ni cambies su sentido — es la única forma de que el cliente sepa cómo seguir). Si no hay "siguientePaso", puedes cerrar con una invitación abierta.',
      esSaludo
        ? '- Este es el saludo inicial: si el cliente ya es conocido (found=true), salúdalo por su nombre de forma natural.'
        : '- El cliente YA fue saludado antes en esta conversación: NO vuelvas a saludarlo ni a presentarte ni a repetir el nombre de la tienda como apertura. Ve directo a responder lo que pidió.',
      '- Responde SOLO con el mensaje final, sin comentarios ni comillas.',
    ].join('\n');

    const userPrompt = [
      `Fase actual: ${input.fase || 'desconocida'}`,
      `Último mensaje del cliente: ${input.mensajeUsuario || '(sin mensaje)'}`,
      `Cliente: ${JSON.stringify(input.cliente ?? { found: false })}`,
      `Datos: ${JSON.stringify(input.datosIA)}`,
    ].join('\n');

    try {
      const client = createNovitaClient(this.config, apiKey);
      const model = this.config.get<string>('NOVITA_MODEL', 'deepseek/deepseek-v3.2');
      const completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 300,
      });
      const reply = completion.choices?.[0]?.message?.content?.trim();
      if (!reply) return null;
      return { reply };
    } catch (err: any) {
      this.logger.error(`ai.compose_reply failed: ${err?.message || err}`);
      return null;
    }
  }
}
