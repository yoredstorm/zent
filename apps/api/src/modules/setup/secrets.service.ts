import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as fs from 'fs';

/** Claves de secreto que el producto gestiona y que pueden resumirse para el comprador. */
const SECRET_KEYS = [
  'POSTGRES_PASSWORD',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'OPENWA_API_KEY',
  'OPENWA_WEBHOOK_SECRET',
  'GF_SECURITY_ADMIN_PASSWORD',
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
        } else {
          value = this.generateSecret(24);
        }

        content = this.upsertEnvLine(content, key, value);
        process.env[key] = value;
        generated.push(key);
      }

      if (generated.length > 0) {
        fs.writeFileSync(file.path, content, 'utf8');
        this.logger.log(`Generated ${generated.length} missing secret(s) into env file`);
      }

      const apiMasterSynced = this.syncApiMasterKeyInEnvFile();
      return { generated, apiMasterSynced };
    } catch (err: any) {
      this.logger.warn(`Could not write env file secrets: ${err?.message || err}`);
      return { generated: [], apiMasterSynced: false };
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
    const dbUser = this.config.get('POSTGRES_USER', 'inventario');
    const dbName = this.config.get('POSTGRES_DB', 'inventario');
    summary['POSTGRES_USER'] = dbUser;
    summary['POSTGRES_DB'] = dbName;
    return summary;
  }
}
