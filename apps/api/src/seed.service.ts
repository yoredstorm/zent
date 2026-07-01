import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { execSync } from 'child_process';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    try {
      this.logger.log('Running prisma db push...');
      execSync('npx prisma db push --skip-generate --accept-data-loss', {
        cwd: process.cwd(),
        stdio: 'pipe',
        env: process.env,
      });
      this.logger.log('DB schema synced');
    } catch (err: any) {
      const detail = err?.stderr?.toString?.() || err?.message || String(err);
      this.logger.error(`DB schema sync failed: ${detail}`);
      throw new Error(`DB schema sync failed: ${detail}`);
    }

    try {
      await this.prisma.$connect();

      // Asegura una fila de estado de instalacion (el wizard /setup la completa).
      const installState = await this.prisma.systemInstall.findFirst();
      if (!installState) {
        await this.prisma.systemInstall.create({ data: { installed: false } });
        this.logger.log('SystemInstall row created (installed=false)');
      }

      const setupForceReset =
        this.config.get('SETUP_FORCE_RESET', 'false') === 'true';
      if (setupForceReset) {
        const row = await this.prisma.systemInstall.findFirst();
        if (row) {
          await this.prisma.systemInstall.update({
            where: { id: row.id },
            data: { installed: false, installedAt: null },
          });
        } else {
          await this.prisma.systemInstall.create({ data: { installed: false } });
        }
        this.logger.warn(
          'SETUP_FORCE_RESET=true: wizard /setup habilitado de nuevo. Quita esta variable tras el deploy.',
        );
      }

      // El admin se crea desde el wizard /setup. Solo lo sembramos automaticamente
      // si se provee ADMIN_EMAIL + ADMIN_PASSWORD de forma explicita por entorno
      // (compatibilidad con despliegues existentes), nunca con credenciales por defecto.
      const email = this.config.get('ADMIN_EMAIL', '').trim();
      const password = this.config.get('ADMIN_PASSWORD', '').trim();
      const forceReset = this.config.get('ADMIN_FORCE_RESET', 'false') === 'true';

      if (email && password) {
        const exists = await this.prisma.user.findUnique({ where: { email } });
        if (!exists) {
          const hash = await bcrypt.hash(password, 10);
          await this.prisma.user.create({
            data: { email, passwordHash: hash, name: 'Admin', role: 'ADMIN' },
          });
          this.logger.log(`Admin created from env: ${email}`);
        } else if (forceReset) {
          const hash = await bcrypt.hash(password, 10);
          await this.prisma.user.update({
            where: { email },
            data: { passwordHash: hash },
          });
          this.logger.log(`Admin password reset from env: ${email}`);
        } else {
          this.logger.log(`Admin already exists: ${email}`);
        }
      }

      const legacyOrders = await this.prisma.order.findMany({
        where: { stockCommitted: false, status: { not: 'CANCELADO' } },
        select: { id: true },
      });
      let migrated = 0;
      for (const order of legacyOrders) {
        const outMoves = await this.prisma.inventoryMovement.count({
          where: { orderId: order.id, type: 'OUT' },
        });
        if (outMoves > 0) {
          await this.prisma.order.update({
            where: { id: order.id },
            data: { stockCommitted: true },
          });
          migrated++;
        }
      }
      if (migrated > 0) {
        this.logger.log(`Migrated ${migrated} legacy orders to stockCommitted=true`);
      }
    } catch (err: any) {
      const detail = err?.stderr?.toString?.() || err?.message || String(err);
      this.logger.error(`Seed/bootstrap failed: ${detail}`);
    }
  }
}
