import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class N8nToolAuthGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      rawBody?: Buffer;
      body?: unknown;
    }>();
    const secret = this.config.get<string>('N8N_WEBHOOK_SECRET', '').trim();
    if (!secret) throw new UnauthorizedException('N8N_WEBHOOK_SECRET is not configured');

    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    if (bearer && this.safeEqual(bearer, secret)) return true;

    const signature = req.headers['x-zent-signature'];
    if (signature && this.verifySignature(secret, this.bodyBuffer(req.rawBody, req.body), signature)) {
      return true;
    }

    throw new UnauthorizedException('Invalid n8n tool signature');
  }

  private bodyBuffer(rawBody: Buffer | undefined, body: unknown): Buffer {
    if (rawBody) return rawBody;
    return Buffer.from(JSON.stringify(body ?? {}));
  }

  private verifySignature(secret: string, body: Buffer, signature: string): boolean {
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
    return this.safeEqual(expected, signature);
  }

  private safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  }
}
