import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';
import { ChatState } from '@prisma/client';
import { createNovitaClient } from './novita.client';
import { BotAiPromptService } from './bot-ai-prompt.service';
import { BOT_AI_TOOLS } from './bot-ai.tools';
import { BotCommerceFacade, BotCommerceContext } from './bot-commerce.facade';
import { ChatSessionService } from '../whatsapp-bot/chat-session.service';
import { BotTurnLogService } from '../whatsapp-bot/bot-turn-log.service';
import { CustomersService } from '../customers/customers.service';

const MAX_TOOL_ROUNDS = 6;
const MAX_AI_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 900;
const NOVITA_TIMEOUT_MS = 45_000;

const FALLBACK_TEXT =
  'Disculpa, hubo un problema técnico. Intenta de nuevo en un momento o escribe *asesor* para hablar con una persona.';

const MAX_ROUNDS_TEXT =
  'Necesito un poco más de información. ¿Qué producto quieres agregar?';

export interface BotTurnMessenger {
  sendText: (text: string) => Promise<void>;
  sendImage?: (url: string, caption: string) => Promise<void>;
  sendDocument?: (url: string, mimetype: string, caption: string) => Promise<void>;
}

export interface HandleTurnParams {
  stateKey: string;
  chatId: string;
  userMessage: string;
  waSessionId?: string;
  contactPhone: string | null;
  messenger: BotTurnMessenger;
}

export function splitWhatsAppMessage(text: string, maxLen = MAX_MESSAGE_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxLen) return [trimmed];

  const parts: string[] = [];
  const paragraphs = trimmed.split(/\n\n+/);
  let buffer = '';

  for (const para of paragraphs) {
    const candidate = buffer ? `${buffer}\n\n${para}` : para;
    if (candidate.length <= maxLen) {
      buffer = candidate;
      continue;
    }
    if (buffer) {
      parts.push(buffer);
      buffer = '';
    }
    if (para.length <= maxLen) {
      buffer = para;
      continue;
    }
    let start = 0;
    while (start < para.length) {
      let end = Math.min(start + maxLen, para.length);
      if (end < para.length) {
        const space = para.lastIndexOf(' ', end);
        if (space > start + 40) end = space;
      }
      parts.push(para.slice(start, end).trim());
      start = end;
    }
  }
  if (buffer) parts.push(buffer);
  return parts.filter(Boolean);
}

@Injectable()
export class BotAiOrchestratorService {
  private readonly logger = new Logger(BotAiOrchestratorService.name);

  constructor(
    private config: ConfigService,
    private prompt: BotAiPromptService,
    private commerce: BotCommerceFacade,
    private chatSession: ChatSessionService,
    private customers: CustomersService,
    private turnLog: BotTurnLogService,
  ) {}

  private get model(): string {
    return this.config.get<string>('NOVITA_MODEL', 'deepseek/deepseek-v3.2').trim();
  }

  private commerceCtx(params: HandleTurnParams): BotCommerceContext {
    return {
      stateKey: params.stateKey,
      chatId: params.chatId,
      waSessionId: params.waSessionId,
      contactPhone: params.contactPhone,
    };
  }

  async handleTurn(params: HandleTurnParams): Promise<void> {
    const { stateKey, userMessage, messenger } = params;
    const startedAt = Date.now();
    const logId = await this.turnLog.startTurn({
      stateKey,
      chatId: params.chatId,
      waSessionId: params.waSessionId,
      mode: 'ai',
      userMessage,
    });

    try {
      await this.chatSession.getOrCreate(stateKey);
      await this.chatSession.updateState(stateKey, ChatState.AI_CONVERSATION);
      const phase = await this.chatSession.getAiPhase(stateKey);
      if (phase === 'browsing') {
        await this.chatSession.setAiPhase(stateKey, 'browsing');
      }

      const phone = params.contactPhone;
      const existing = phone ? await this.customers.findByPhone(phone) : null;
      const systemPrompt = await this.prompt.buildSystemPrompt({
        customerName: existing?.name,
        customerPhone: existing?.phone ?? phone,
      });

      const history = (await this.chatSession.getAiMessages(
        stateKey,
      )) as ChatCompletionMessageParam[];
      const messages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userMessage },
      ];

      const client = createNovitaClient(this.config);
      let rounds = 0;
      let lastAssistantText = '';

      while (rounds < MAX_TOOL_ROUNDS) {
        rounds++;
        const completion = await client.chat.completions.create(
          {
            model: this.model,
            messages,
            tools: BOT_AI_TOOLS,
            tool_choice: 'auto',
            temperature: 0.4,
            max_tokens: 800,
          },
          { signal: AbortSignal.timeout(NOVITA_TIMEOUT_MS) },
        );

        const choice = completion.choices[0]?.message;
        if (!choice) break;

        messages.push(choice as ChatCompletionMessageParam);

        if (choice.tool_calls?.length) {
          for (const call of choice.tool_calls) {
            const fn = call.type === 'function' ? call.function : null;
            let args: Record<string, unknown> = {};
            if (fn?.arguments) {
              try {
                args = JSON.parse(fn.arguments);
              } catch {
                args = {};
              }
            }
            const toolResult = await this.runTool(call, params);
            const toolError =
              toolResult &&
              typeof toolResult === 'object' &&
              'error' in (toolResult as Record<string, unknown>)
                ? String((toolResult as { error: unknown }).error)
                : undefined;
            await this.turnLog.appendTool(logId, {
              name: fn?.name ?? 'unknown',
              args,
              result: toolResult,
              error: toolError,
            });
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(toolResult),
            });
          }
          continue;
        }

        lastAssistantText = (choice.content ?? '').trim();
        break;
      }

      if (!lastAssistantText) {
        lastAssistantText =
          rounds >= MAX_TOOL_ROUNDS
            ? MAX_ROUNDS_TEXT
            : 'Disculpa, tuve un problema procesando tu mensaje. Escribe *menu* para empezar de nuevo o *asesor* para hablar con una persona.';
      }

      const chunks = splitWhatsAppMessage(lastAssistantText);
      for (const chunk of chunks) {
        await messenger.sendText(chunk);
      }

      const persisted = messages
        .filter((m) => m.role !== 'system')
        .slice(-MAX_AI_MESSAGES) as ChatCompletionMessageParam[];
      await this.chatSession.setAiMessages(stateKey, persisted);

      await this.turnLog.completeTurn(logId, lastAssistantText, Date.now() - startedAt);
    } catch (err: any) {
      const message = err?.message || String(err);
      this.logger.error(`AI turn failed for ${stateKey}: ${message}`);
      await this.turnLog.failTurn(logId, message.slice(0, 2000), FALLBACK_TEXT);
      try {
        await messenger.sendText(FALLBACK_TEXT);
      } catch (sendErr: any) {
        this.logger.error(`AI fallback send failed: ${sendErr?.message || sendErr}`);
        throw err;
      }
    }
  }

  private async runTool(
    call: ChatCompletionMessageToolCall,
    params: HandleTurnParams,
  ): Promise<unknown> {
    const fn = call.type === 'function' ? call.function : null;
    if (!fn) return { error: 'Tool call inválida' };

    let args: Record<string, unknown> = {};
    try {
      args = fn.arguments ? JSON.parse(fn.arguments) : {};
    } catch {
      return { error: 'Argumentos JSON inválidos' };
    }

    const ctx = this.commerceCtx(params);

    try {
      switch (fn.name) {
        case 'list_categories':
          return await this.commerce.listCategories();
        case 'search_products':
          return await this.commerce.searchProducts(
            args.query as string | undefined,
            args.categoryId as string | undefined,
            (args.limit as number | undefined) ?? 10,
          );
        case 'get_product_details': {
          const detail = await this.commerce.getProductDetails(String(args.productId), ctx);
          if (!('error' in (detail as any)) && (detail as any).imageUrl && params.messenger.sendImage) {
            const d = detail as { nombre: string; salePrice: number; availableStock: number; imageUrl: string };
            await params.messenger.sendImage(
              d.imageUrl,
              `*${d.nombre}* — S/ ${d.salePrice.toFixed(2)} (${d.availableStock} disp.)`,
            );
          }
          return detail;
        }
        case 'get_customer_profile':
          return await this.commerce.getCustomerProfile(ctx);
        case 'add_to_cart':
          return await this.commerce.addToCart(ctx, String(args.productId), Number(args.quantity) || 1);
        case 'update_cart_item':
          return await this.commerce.updateCartItem(
            ctx,
            String(args.productId),
            Number(args.quantity) ?? 0,
          );
        case 'view_cart':
          return await this.commerce.viewCart(ctx);
        case 'remove_from_cart':
          return await this.commerce.removeFromCart(ctx, String(args.productId));
        case 'get_checkout_draft':
          return await this.commerce.getCheckoutDraft(ctx);
        case 'save_checkout_field':
          return await this.commerce.saveCheckoutField(
            ctx,
            args.field as 'customerName' | 'customerPhone' | 'address' | 'reference',
            String(args.value ?? ''),
          );
        case 'confirm_order':
          return await this.commerce.confirmOrder(ctx);
        case 'submit_order': {
          const draft = await this.chatSession.getCheckoutDraft(params.stateKey);
          if (!draft.confirmed) {
            const checkout = await this.commerce.getCheckoutDraft(ctx);
            if (!checkout.readyToConfirm) {
              return {
                error: 'Completa los datos de entrega y usa confirm_order antes de submit_order',
                missing: checkout.missing,
              };
            }
          }
          return await this.commerce.submitOrder(ctx, {
            customerName: String(args.customerName ?? draft.customerName ?? ''),
            customerPhone: String(args.customerPhone ?? draft.customerPhone ?? params.contactPhone ?? ''),
            address: String(args.address ?? draft.address ?? ''),
            reference: args.reference ? String(args.reference) : draft.reference,
          });
        }
        case 'handoff_to_human': {
          const result = await this.commerce.handoffToHuman(ctx, args.reason ? String(args.reason) : undefined);
          await params.messenger.sendText(
            '👤 Te conectamos con un asesor humano. Por favor espera.\n\nEscribe *RETOMAR* cuando quieras volver al asistente automático.',
          );
          return result;
        }
        case 'get_catalog_pdf': {
          const pdf = await this.commerce.getCatalogPdf();
          if (pdf.available && pdf.url) {
            if (params.messenger.sendDocument) {
              await params.messenger.sendDocument(
                pdf.url,
                'application/pdf',
                '📋 Catálogo completo',
              );
            }
          }
          return pdf;
        }
        default:
          return { error: `Herramienta desconocida: ${fn.name}` };
      }
    } catch (err: any) {
      this.logger.warn(`Tool ${fn.name} failed: ${err?.message || err}`);
      return { error: err?.message || 'Error ejecutando herramienta' };
    }
  }

  async resumeFromHandoff(params: HandleTurnParams): Promise<void> {
    await this.chatSession.updateState(params.stateKey, ChatState.AI_CONVERSATION);
    await this.chatSession.setAiPhase(params.stateKey, 'browsing');
    await params.messenger.sendText(
      '🤖 Volviste al asistente automático. ¿En qué te ayudo hoy?',
    );
  }

  async clearAiHistory(stateKey: string): Promise<void> {
    await this.chatSession.setAiMessages(stateKey, []);
    await this.chatSession.setAiPhase(stateKey, 'browsing');
    await this.chatSession.clearCheckoutDraft(stateKey);
  }
}
