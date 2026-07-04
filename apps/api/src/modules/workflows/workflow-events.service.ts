import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { BotEngineService } from '../whatsapp-bot/bot-engine.service';

export const WORKFLOW_FETCH = Symbol('WORKFLOW_FETCH');

export type WorkflowEventName =
  | 'order.created'
  | 'order.status_changed'
  | 'payment.reference_submitted'
  | 'handoff.requested'
  | 'novita.low_balance'
  | 'test.ping';

export interface WorkflowEmitResult {
  event: WorkflowEventName;
  ok: boolean;
  skipped: boolean;
  status: number | null;
  url: string | null;
  responseText?: string;
  error?: string;
}

@Injectable()
export class WorkflowEventsService {
  private readonly logger = new Logger(WorkflowEventsService.name);

  constructor(
    private config: ConfigService,
    private botEngine: BotEngineService,
    @Optional()
    @Inject(WORKFLOW_FETCH)
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async enabled(): Promise<boolean> {
    const cfg = await this.botEngine.getConfig();
    return cfg.n8nWorkflowsEnabled;
  }

  async baseUrl(): Promise<string> {
    const cfg = await this.botEngine.getConfig();
    return cfg.n8nWebhookBaseUrl.trim().replace(/\/$/, '');
  }

  secret(): string {
    return this.config.get<string>('N8N_WEBHOOK_SECRET', '').trim();
  }

  async salesMode(): Promise<'disabled' | 'sandbox' | 'core'> {
    const cfg = await this.botEngine.getConfig();
    return cfg.n8nSalesMode;
  }

  sign(body: string): string {
    const secret = this.secret();
    if (!secret) return '';
    const digest = crypto.createHmac('sha256', secret).update(body).digest('hex');
    return `sha256=${digest}`;
  }

  verifySignature(body: string, signature?: string): boolean {
    const expected = this.sign(body);
    if (!expected || !signature) return false;
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }

  private async shouldEmit(event: WorkflowEventName, force = false): Promise<boolean> {
    if (force || event === 'test.ping') return true;
    const salesEvents: WorkflowEventName[] = [
      'order.created',
      'order.status_changed',
      'payment.reference_submitted',
      'handoff.requested',
    ];
    if (!salesEvents.includes(event)) return true;
    return (await this.salesMode()) === 'core';
  }

  async emitWithResult(
    event: WorkflowEventName,
    payload: Record<string, unknown>,
    options: { force?: boolean } = {},
  ): Promise<WorkflowEmitResult> {
    if (!(await this.enabled())) {
      return { event, ok: false, skipped: true, status: null, url: null, error: 'disabled' };
    }
    const baseUrl = await this.baseUrl();
    if (!baseUrl) {
      return { event, ok: false, skipped: true, status: null, url: null, error: 'base_url_missing' };
    }
    if (!(await this.shouldEmit(event, options.force))) {
      return {
        event,
        ok: false,
        skipped: true,
        status: null,
        url: null,
        error: `sales_mode_${this.salesMode()}`,
      };
    }

    const body = JSON.stringify({ event, payload, sentAt: new Date().toISOString() });
    const url = `${baseUrl}/${encodeURIComponent(event)}`;

    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Zent-Event': event,
          'X-Zent-Signature': this.sign(body),
        },
        body,
      });
      const text = await res.text().catch(() => '');
      if (!res.ok) {
        this.logger.warn(`n8n event ${event} failed: ${res.status} ${text.slice(0, 200)}`);
      }
      return {
        event,
        ok: res.ok,
        skipped: false,
        status: res.status,
        url,
        responseText: text.slice(0, 500),
      };
    } catch (err: any) {
      this.logger.warn(`n8n event ${event} error: ${err?.message || err}`);
      return {
        event,
        ok: false,
        skipped: false,
        status: null,
        url,
        error: err?.message || String(err),
      };
    }
  }

  async emit(event: WorkflowEventName, payload: Record<string, unknown>): Promise<void> {
    await this.emitWithResult(event, payload);
  }

  async runSalesSandbox(): Promise<{ ok: boolean; sandboxId: string; events: WorkflowEmitResult[] }> {
    const sandboxId = `sandbox_${Date.now()}`;
    const basePayload = {
      sandbox: true,
      sandboxId,
      customerPhone: '51999999999',
    };
    const events: Array<{ event: WorkflowEventName; payload: Record<string, unknown> }> = [
      { event: 'test.ping', payload: { ...basePayload, source: 'dashboard_sandbox' } },
      {
        event: 'order.created',
        payload: {
          ...basePayload,
          orderId: sandboxId,
          shortId: sandboxId.slice(0, 12),
          status: 'NUEVO',
          total: 99.9,
          source: 'SANDBOX',
        },
      },
      {
        event: 'payment.reference_submitted',
        payload: {
          ...basePayload,
          orderId: sandboxId,
          shortId: sandboxId.slice(0, 12),
          method: 'Transferencia sandbox',
          reference: 'SANDBOX-REF-001',
        },
      },
      {
        event: 'order.status_changed',
        payload: {
          ...basePayload,
          orderId: sandboxId,
          status: 'CONFIRMADO',
        },
      },
    ];

    const results: WorkflowEmitResult[] = [];
    for (const item of events) {
      results.push(await this.emitWithResult(item.event, item.payload, { force: true }));
    }
    return { ok: results.every((result) => result.ok), sandboxId, events: results };
  }
}
