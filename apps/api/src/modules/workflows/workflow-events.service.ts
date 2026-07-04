import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export const WORKFLOW_FETCH = Symbol('WORKFLOW_FETCH');

export type WorkflowEventName =
  | 'order.created'
  | 'order.status_changed'
  | 'payment.reference_submitted'
  | 'handoff.requested'
  | 'novita.low_balance'
  | 'test.ping';

@Injectable()
export class WorkflowEventsService {
  private readonly logger = new Logger(WorkflowEventsService.name);

  constructor(
    private config: ConfigService,
    @Optional()
    @Inject(WORKFLOW_FETCH)
    private fetchImpl: typeof fetch = fetch,
  ) {}

  enabled(): boolean {
    return this.config.get<string>('N8N_WORKFLOWS_ENABLED', 'false') === 'true';
  }

  baseUrl(): string {
    return this.config.get<string>('N8N_WEBHOOK_BASE_URL', '').trim().replace(/\/$/, '');
  }

  secret(): string {
    return this.config.get<string>('N8N_WEBHOOK_SECRET', '').trim();
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

  async emit(event: WorkflowEventName, payload: Record<string, unknown>): Promise<void> {
    if (!this.enabled()) return;
    const baseUrl = this.baseUrl();
    if (!baseUrl) return;

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
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(`n8n event ${event} failed: ${res.status} ${text.slice(0, 200)}`);
      }
    } catch (err: any) {
      this.logger.warn(`n8n event ${event} error: ${err?.message || err}`);
    }
  }
}
