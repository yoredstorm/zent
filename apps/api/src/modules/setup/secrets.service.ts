import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/** Claves de secreto que el producto gestiona y que pueden resumirse para el comprador. */
const SECRET_KEYS = [
  'POSTGRES_PASSWORD',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'OPENWA_API_KEY',
  'OPENWA_WEBHOOK_SECRET',
  'GF_SECURITY_ADMIN_PASSWORD',
] as const;

/** Variables de configuracion no secreta incluidas en credenciales-zent.txt. */
const CONFIG_KEYS = [
  'POSTGRES_USER',
  'POSTGRES_DB',
  'DATABASE_URL',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_URL',
  'REDIS_ENABLED',
  'REDIS_BUILTIN',
  'QUEUE_ENABLED',
  'API_MASTER_KEY',
  'OPENWA_BASE_URL',
  'OPENWA_WEBHOOK_URL',
  'OPENWA_PUBLIC_URL',
  'BOT_PLUGIN_SECRET',
  'ZENT_FLOW_PLUGIN_ENABLED',
  'STORE_NAME',
  'CART_HOLD_TTL_MINUTES',
  'CART_HOLD_WARN_MINUTES',
  'VENDOR_NOTIFY_PHONES',
  'PUBLIC_API_URL',
  'ADMIN_FORCE_RESET',
  'GF_SECURITY_ADMIN_USER',
] as const;

/** Valores placeholder conocidos que NO deben considerarse secretos validos. */
const PLACEHOLDERS = new Set([
  '',
  'changeme',
  'change-me',
  'your-jwt-secret-here',
  'your-refresh-secret-here',
  'webhook-secret-change-me',
  'owa_k1_xxxxxxxx',
]);

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);

  constructor(private config: ConfigService) {}

  /** Genera un secreto hexadecimal seguro (equivalente a `openssl rand -hex <bytes>`). */
  generateSecret(bytes = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  private generateOpenWaApiKey(): string {
    return `owa_k1_${this.generateSecret(32)}`;
  }

  private isPlaceholder(value: string | undefined): boolean {
    return value === undefined || PLACEHOLDERS.has(value.trim());
  }

  private readEnvFile(): { path: string; content: string } | null {
    const envPath = this.config.get<string>('ENV_FILE_PATH', '').trim();
    if (!envPath || !fs.existsSync(envPath)) return null;
    return { path: envPath, content: fs.readFileSync(envPath, 'utf8') };
  }

  private upsertEnvLine(content: string, key: string, value: string): string {
    const line = `${key}=${value}`;
    const regex = new RegExp(`^${key}=.*$`, 'm');
    return regex.test(content) ? content.replace(regex, line) : `${content.trimEnd()}\n${line}\n`;
  }

  /**
   * Garantiza API_MASTER_KEY === OPENWA_API_KEY en el archivo .env.
   * OpenWA solo aplica API_MASTER_KEY al crear su volumen por primera vez.
   */
  syncApiMasterKeyInEnvFile(): boolean {
    const file = this.readEnvFile();
    if (!file) return false;

    const openwaMatch = file.content.match(/^OPENWA_API_KEY=(.+)$/m);
    const openwaKey = openwaMatch?.[1]?.trim() || process.env.OPENWA_API_KEY?.trim();
    if (!openwaKey || this.isPlaceholder(openwaKey)) return false;

    const masterMatch = file.content.match(/^API_MASTER_KEY=(.+)$/m);
    const masterKey = masterMatch?.[1]?.trim();
    if (masterKey === openwaKey) return false;

    try {
      const updated = this.upsertEnvLine(file.content, 'API_MASTER_KEY', openwaKey);
      fs.writeFileSync(file.path, updated, 'utf8');
      process.env.API_MASTER_KEY = openwaKey;
      this.logger.log('API_MASTER_KEY sincronizada con OPENWA_API_KEY en .env');
      return true;
    } catch (err: any) {
      this.logger.warn(`No se pudo sincronizar API_MASTER_KEY: ${err?.message || err}`);
      return false;
    }
  }

  /**
   * Rellena en el archivo .env (en disco, montado como volumen) cualquier secreto
   * faltante o placeholder. Siempre sincroniza API_MASTER_KEY con OPENWA_API_KEY.
   */
  ensureEnvFileSecrets(): { generated: string[]; apiMasterSynced: boolean } {
    const file = this.readEnvFile();
    if (!file) {
      return { generated: [], apiMasterSynced: false };
    }

    try {
      let content = file.content;
      const generated: string[] = [];

      for (const key of SECRET_KEYS) {
        const current = process.env[key];
        if (!this.isPlaceholder(current)) continue;

        let value: string;
        if (key === 'GF_SECURITY_ADMIN_PASSWORD') {
          value = this.generateSecret(12);
        } else if (key === 'OPENWA_API_KEY') {
          value = this.generateOpenWaApiKey();
        } else if (key === 'JWT_SECRET' || key === 'JWT_REFRESH_SECRET') {
          value = this.generateSecret(32);
        } else {
          value = this.generateSecret(24);
        }

        content = this.upsertEnvLine(content, key, value);
        process.env[key] = value;
        generated.push(key);
      }

      if (generated.includes('OPENWA_WEBHOOK_SECRET') && this.isPlaceholder(process.env.BOT_PLUGIN_SECRET)) {
        content = this.upsertEnvLine(content, 'BOT_PLUGIN_SECRET', process.env.OPENWA_WEBHOOK_SECRET!);
        process.env.BOT_PLUGIN_SECRET = process.env.OPENWA_WEBHOOK_SECRET!;
      }

      if (generated.length > 0) {
        fs.writeFileSync(file.path, content, 'utf8');
        this.logger.log(`Generated ${generated.length} missing secret(s) into env file`);
      }

      const apiMasterSynced = this.syncApiMasterKeyInEnvFile();
      this.writeCredentialsFile(file.path);
      return { generated, apiMasterSynced };
    } catch (err: any) {
      this.logger.warn(`Could not write env file secrets: ${err?.message || err}`);
      return { generated: [], apiMasterSynced: false };
    }
  }

  /** Escribe credenciales-zent.txt junto al .env con todas las variables. */
  writeCredentialsFile(envPath?: string): void {
    const resolved = envPath || this.config.get<string>('ENV_FILE_PATH', '').trim();
    if (!resolved || !fs.existsSync(resolved)) return;
    try {
      const dir = path.dirname(resolved);
      const credPath = path.join(dir, 'credenciales-zent.txt');
      const content = fs.readFileSync(resolved, 'utf8');
      const header = [
        '# ─── CREDENCIALES ZENT — generado automáticamente ───',
        '# NO subir a git. Guarda este archivo en un lugar seguro.',
        '# SSRF_ALLOWED_HOSTS=backend-api (fijado en docker-compose, no en .env)',
        '',
      ].join('\n');
      fs.writeFileSync(credPath, header + content, 'utf8');
    } catch (err: any) {
      this.logger.warn(`No se pudo escribir credenciales-zent.txt: ${err?.message || err}`);
    }
  }

  getCredentialsSummary(): Record<string, string> {
    const summary: Record<string, string> = {};

    for (const key of SECRET_KEYS) {
      const value = process.env[key];
      if (value && !this.isPlaceholder(value)) {
        summary[key] = value;
      }
    }

    const openwaKey = process.env.OPENWA_API_KEY;
    if (openwaKey && !this.isPlaceholder(openwaKey)) {
      summary['API_MASTER_KEY'] = openwaKey;
    }

    for (const key of CONFIG_KEYS) {
      if (key === 'API_MASTER_KEY') continue;
      const fromEnv = process.env[key];
      const fromConfig = this.config.get<string>(key, '');
      const value = fromEnv?.trim() || fromConfig?.trim() || '';
      if (value && !this.isPlaceholder(value)) {
        summary[key] = value;
      }
    }

    // Defaults operativos cuando no estan en .env
    if (!summary['POSTGRES_USER']) summary['POSTGRES_USER'] = 'inventario';
    if (!summary['POSTGRES_DB']) summary['POSTGRES_DB'] = 'inventario';
    if (!summary['REDIS_HOST']) summary['REDIS_HOST'] = 'redis';
    if (!summary['REDIS_PORT']) summary['REDIS_PORT'] = '6379';
    if (!summary['REDIS_URL']) summary['REDIS_URL'] = 'redis://redis:6379';
    if (!summary['REDIS_ENABLED']) summary['REDIS_ENABLED'] = 'true';
    if (!summary['REDIS_BUILTIN']) summary['REDIS_BUILTIN'] = 'false';
    if (!summary['QUEUE_ENABLED']) summary['QUEUE_ENABLED'] = 'true';
    if (!summary['OPENWA_BASE_URL']) summary['OPENWA_BASE_URL'] = 'http://openwa:2785';
    if (!summary['OPENWA_WEBHOOK_URL']) {
      summary['OPENWA_WEBHOOK_URL'] = 'http://backend-api:3000/api/webhooks/openwa';
    }
    if (!summary['BOT_PLUGIN_SECRET'] && summary['OPENWA_WEBHOOK_SECRET']) {
      summary['BOT_PLUGIN_SECRET'] = summary['OPENWA_WEBHOOK_SECRET'];
    }
    if (!summary['ADMIN_FORCE_RESET']) summary['ADMIN_FORCE_RESET'] = 'false';
    if (!summary['GF_SECURITY_ADMIN_USER']) summary['GF_SECURITY_ADMIN_USER'] = 'admin';

    if (!summary['DATABASE_URL'] && summary['POSTGRES_PASSWORD']) {
      summary['DATABASE_URL'] =
        `postgresql://${summary['POSTGRES_USER']}:${summary['POSTGRES_PASSWORD']}@postgres:5432/${summary['POSTGRES_DB']}`;
    }

    return summary;
  }
}
