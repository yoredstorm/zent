import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, ReplaySubject } from 'rxjs';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenwaService } from '../openwa/openwa.service';
import { OpenwaBootstrapService } from '../openwa/openwa-bootstrap.service';
import { SecretsService } from './secrets.service';
import { InstallDto } from './dto/setup.dto';

export interface InstallEvent {
  step: number;
  total: number;
  label: string;
  status: 'running' | 'ok' | 'error' | 'done';
  message?: string;
}

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);
  private installed = false;
  private activeInstall: ReplaySubject<MessageEvent> | null = null;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private secrets: SecretsService,
    private openwa: OpenwaService,
    private openwaBootstrap: OpenwaBootstrapService,
  ) {}

  /** Lectura cacheada del estado de instalacion (solo cachea cuando ya esta instalado). */
  async isInstalled(): Promise<boolean> {
    if (this.installed) return true;
    const state = await this.prisma.systemInstall.findFirst();
    if (state?.installed) {
      this.installed = true;
      return true;
    }
    return false;
  }

  async getStatus() {
    const installed = await this.isInstalled();
    const settings = await this.prisma.storeSettings.findFirst();
    let openwaKeyValid = false;
    if (!installed) {
      try {
        await this.openwa.validateApiKey();
        openwaKeyValid = true;
      } catch {
        openwaKeyValid = false;
      }
    }
    return {
      installed,
      storeName: settings?.storeName ?? null,
      logoUrl: settings?.logoUrl ?? null,
      currency: settings?.currency ?? null,
      whatsappLinked: settings?.whatsappLinked ?? false,
      openwaKeyValid,
    };
  }

  getCredentialsSummary() {
    return this.secrets.getCredentialsSummary();
  }

  /** Arranca la instalacion (idempotente) y devuelve de inmediato; el progreso va por SSE. */
  startInstall(dto: InstallDto): { started: boolean } {
    if (this.running) {
      return { started: false };
    }
    this.running = true;
    this.activeInstall = new ReplaySubject<MessageEvent>(500);
    void this.runInstall(dto).finally(() => {
      this.running = false;
    });
    return { started: true };
  }

  getInstallStream(): Observable<MessageEvent> {
    if (!this.activeInstall) {
      // Aun no se ha lanzado POST /install; mantener un canal abierto vacio.
      this.activeInstall = new ReplaySubject<MessageEvent>(500);
    }
    return this.activeInstall.asObservable();
  }

  private emit(event: InstallEvent) {
    this.activeInstall?.next({ data: event });
  }

  private async runInstall(dto: InstallDto): Promise<void> {
    const total = 6;
    try {
      // 1. Verificar conexion a base de datos
      this.emit({ step: 1, total, label: 'Verificando base de datos', status: 'running' });
      await this.prisma.$queryRaw`SELECT 1`;
      this.emit({ step: 1, total, label: 'Verificando base de datos', status: 'ok' });

      // 2. Generar/persistir secretos faltantes
      this.emit({ step: 2, total, label: 'Generando secretos seguros', status: 'running' });
      const { generated, apiMasterSynced } = this.secrets.ensureEnvFileSecrets();
      const secretMsg =
        generated.length > 0
          ? `Generados: ${generated.join(', ')}`
          : apiMasterSynced
            ? 'API_MASTER_KEY sincronizada'
            : 'Secretos ya configurados';
      this.emit({
        step: 2,
        total,
        label: 'Generando secretos seguros',
        status: 'ok',
        message: secretMsg,
      });

      // 3. Guardar configuracion de la tienda (idempotente)
      this.emit({ step: 3, total, label: 'Guardando datos de la tienda', status: 'running' });
      await this.upsertStoreSettings(dto);
      this.emit({ step: 3, total, label: 'Guardando datos de la tienda', status: 'ok' });

      // 4. Crear/actualizar cuenta de administrador (idempotente)
      this.emit({ step: 4, total, label: 'Creando cuenta de administrador', status: 'running' });
      await this.upsertAdmin(dto);
      this.emit({ step: 4, total, label: 'Creando cuenta de administrador', status: 'ok' });

      // 5. Validar OpenWA, Redis/BullMQ y webhook
      this.emit({
        step: 5,
        total,
        label: 'Conectando con WhatsApp Gateway',
        status: 'running',
        message: 'Configurando Redis y colas BullMQ',
      });
      const openwaReady = await this.waitForOpenWaKey();
      if (openwaReady) {
        try {
          await this.openwaBootstrap.configureOpenWaWithRetries(4);
          this.emit({
            step: 5,
            total,
            label: 'Conectando con WhatsApp Gateway',
            status: 'ok',
            message: 'Redis, BullMQ y webhook configurados',
          });
        } catch (err: any) {
          this.emit({
            step: 5,
            total,
            label: 'Conectando con WhatsApp Gateway',
            status: 'ok',
            message: 'OpenWA parcialmente configurado; se completara al vincular WhatsApp',
          });
          this.logger.warn(`OpenWA setup: ${err?.message || err}`);
        }
      } else {
        this.emit({
          step: 5,
          total,
          label: 'Conectando con WhatsApp Gateway',
          status: 'ok',
          message:
            'OpenWA aun no acepta la clave API. Ejecuta: cd infra && ./install.sh (reinicia OpenWA)',
        });
        this.logger.warn('OPENWA_API_KEY not accepted after retries');
      }

      // 6. Marcar el sistema como instalado
      this.emit({ step: 6, total, label: 'Finalizando instalacion', status: 'running' });
      await this.markInstalled();
      this.emit({ step: 6, total, label: 'Finalizando instalacion', status: 'ok' });

      this.emit({ step: total, total, label: 'Instalacion completada', status: 'done' });
      this.activeInstall?.complete();
    } catch (err: any) {
      const message = err?.message || String(err);
      this.logger.error(`Install failed: ${message}`);
      this.emit({ step: 0, total, label: 'Instalacion fallida', status: 'error', message });
      this.activeInstall?.complete();
    }
  }

  private async upsertStoreSettings(dto: InstallDto) {
    const existing = await this.prisma.storeSettings.findFirst();
    const data = {
      storeName: dto.storeName,
      logoUrl: dto.logoUrl ?? null,
      currency: dto.currency || 'PEN',
      taxRate: dto.taxRate ?? 18,
      phoneNumber: dto.phoneNumber,
      ownerName: dto.ownerName ?? null,
    };
    if (existing) {
      await this.prisma.storeSettings.update({ where: { id: existing.id }, data });
    } else {
      await this.prisma.storeSettings.create({ data });
    }
  }

  private async upsertAdmin(dto: InstallDto) {
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
    await this.prisma.user.upsert({
      where: { email: dto.adminEmail },
      update: { passwordHash, role: 'ADMIN', name: dto.adminName ?? 'Admin' },
      create: {
        email: dto.adminEmail,
        passwordHash,
        role: 'ADMIN',
        name: dto.adminName ?? 'Admin',
      },
    });
  }

  private async markInstalled() {
    const existing = await this.prisma.systemInstall.findFirst();
    if (existing) {
      await this.prisma.systemInstall.update({
        where: { id: existing.id },
        data: { installed: true, installedAt: new Date() },
      });
    } else {
      await this.prisma.systemInstall.create({
        data: { installed: true, installedAt: new Date() },
      });
    }
    this.installed = true;
  }

  /** Espera a que OpenWA acepte OPENWA_API_KEY (puede tardar tras reinicio del contenedor). */
  private async waitForOpenWaKey(attempts = 15, delayMs = 2000): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      try {
        await this.openwa.validateApiKey();
        return true;
      } catch {
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    return false;
  }

  /** Estado de la sesion de WhatsApp via OpenWA; actualiza whatsappLinked cuando conecta. */
  async getWhatsappStatus(): Promise<{ status: string; keyValid?: boolean }> {
    try {
      await this.openwa.validateApiKey();
    } catch {
      return { status: 'error', keyValid: false };
    }

    try {
      const sessions = await this.openwa.getSessions();
      if (sessions.length === 0) {
        return { status: 'no_sessions', keyValid: true };
      }
      const status = await this.openwa.getSessionStatus();
      const uiStatus = this.openwa.mapStatusForUi(status);
      if (this.openwa.isConnectedStatus(status)) {
        await this.setWhatsappLinked(true);
        void this.onWhatsappConnected();
      }
      return { status: uiStatus, keyValid: true };
    } catch {
      return { status: 'error', keyValid: true };
    }
  }

  async getWhatsappQR(): Promise<{ qr?: string; error?: string; keyValid?: boolean }> {
    const keyOk = await this.waitForOpenWaKey(3, 1000);
    if (!keyOk) {
      return {
        error:
          'OpenWA no acepta la clave API. Ejecuta infra/install.sh para sincronizar y reiniciar OpenWA.',
        keyValid: false,
      };
    }
    try {
      const sessions = await this.openwa.getSessions();
      if (sessions.length === 0) {
        return { error: 'Pulsa "Vincular ahora" para crear la sesion.', keyValid: true };
      }
      const sessionId = sessions[0].id;
      const qr = await this.openwa.tryGetQROnce(sessionId);
      if (qr) return { qr, keyValid: true };
      return { qr: undefined, keyValid: true };
    } catch {
      return { keyValid: true };
    }
  }

  /** Crea/inicia sesion OpenWA y responde al instante; el QR llega por polling. */
  async connectWhatsapp(): Promise<{
    qr?: string;
    error?: string;
    keyValid?: boolean;
    pending?: boolean;
    sessionId?: string;
  }> {
    const keyOk = await this.waitForOpenWaKey(4, 1000);
    if (!keyOk) {
      return {
        error:
          'OpenWA no acepta la clave API. Ejecuta infra/install.sh para sincronizar y reiniciar OpenWA.',
        keyValid: false,
      };
    }
    try {
      const settings = await this.prisma.storeSettings.findFirst();
      const { sessionId, qr, status } = await this.openwa.ensureSessionForPairing(
        { name: settings?.storeName || undefined },
        false,
      );
      if (this.openwa.isConnectedStatus(status)) {
        await this.setWhatsappLinked(true);
        void this.onWhatsappConnected();
        return { qr: '', keyValid: true, sessionId };
      }
      if (qr) return { qr, keyValid: true, sessionId };
      return { pending: true, keyValid: true, sessionId };
    } catch (err: any) {
      this.logger.warn(`connectWhatsapp failed: ${err?.message || err}`);
      return {
        error: err?.message || 'No se pudo iniciar la sesion de WhatsApp',
        keyValid: true,
      };
    }
  }

  async setWhatsappLinked(linked: boolean): Promise<void> {
    const existing = await this.prisma.storeSettings.findFirst();
    if (existing && existing.whatsappLinked !== linked) {
      await this.prisma.storeSettings.update({
        where: { id: existing.id },
        data: { whatsappLinked: linked },
      });
    }
  }

  /** Tras vincular WhatsApp: Redis, BullMQ y webhook en OpenWA. */
  private async onWhatsappConnected(): Promise<void> {
    try {
      await this.openwaBootstrap.configureOpenWaWithRetries(3);
    } catch (err: any) {
      this.logger.warn(`OpenWA post-connect setup: ${err?.message || err}`);
    }
  }
}
