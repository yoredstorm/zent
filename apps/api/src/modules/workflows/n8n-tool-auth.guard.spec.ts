import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { N8nToolAuthGuard } from './n8n-tool-auth.guard';

describe('N8nToolAuthGuard', () => {
  const secret = 'secret-123';
  const body = { event: 'test' };
  const rawBody = Buffer.from(JSON.stringify(body));
  const config = { get: (key: string, fallback?: string) => (key === 'N8N_WEBHOOK_SECRET' ? secret : fallback) };

  function context(headers: Record<string, string> = {}) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers, body, rawBody }),
      }),
    } as any;
  }

  it('rejects requests without a signature or bearer token', () => {
    const guard = new N8nToolAuthGuard(config as any);
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });

  it('rejects invalid signatures', () => {
    const guard = new N8nToolAuthGuard(config as any);
    expect(() => guard.canActivate(context({ 'x-zent-signature': 'sha256=bad' }))).toThrow(
      UnauthorizedException,
    );
  });

  it('allows a valid bearer token', () => {
    const guard = new N8nToolAuthGuard(config as any);
    expect(guard.canActivate(context({ authorization: `Bearer ${secret}` }))).toBe(true);
  });

  it('allows a valid HMAC signature', () => {
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const guard = new N8nToolAuthGuard(config as any);
    expect(guard.canActivate(context({ 'x-zent-signature': `sha256=${digest}` }))).toBe(true);
  });
});
