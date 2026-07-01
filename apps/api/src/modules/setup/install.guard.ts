import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SetupService } from './setup.service';

/** Rutas accesibles aunque el sistema no este instalado todavia. */
const WHITELIST_PREFIXES = ['/api/setup', '/api/health'];

@Injectable()
export class InstallGuard implements CanActivate {
  constructor(private setup: SetupService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const rawUrl: string = req.originalUrl || req.url || '';
    const path = rawUrl.split('?')[0];

    if (WHITELIST_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      return true;
    }

    const installed = await this.setup.isInstalled();
    if (installed) return true;

    throw new ServiceUnavailableException({
      statusCode: 503,
      error: 'NOT_INSTALLED',
      message: 'Sistema no instalado. Completa la instalacion en /setup.',
    });
  }
}
