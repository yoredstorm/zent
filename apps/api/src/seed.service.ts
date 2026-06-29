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
      execSync('npx prisma db push --skip-generate', { cwd: '/app', stdio: 'pipe' });
      this.logger.log('DB schema synced');

      await this.prisma.$connect();

      const email = this.config.get('ADMIN_EMAIL', 'the.ares.p@gmail.com');
      const password = this.config.get('ADMIN_PASSWORD', 'Jaredcito2025@1');
      const forceReset = this.config.get('ADMIN_FORCE_RESET', 'false') === 'true';

      const exists = await this.prisma.user.findUnique({ where: { email } });

      if (!exists) {
        const hash = await bcrypt.hash(password, 10);
        await this.prisma.user.create({
          data: { email, passwordHash: hash, name: 'Admin', role: 'ADMIN' },
        });
        this.logger.log(`Admin created: ${email}`);
      } else if (forceReset) {
        const hash = await bcrypt.hash(password, 10);
        await this.prisma.user.update({
          where: { email },
          data: { passwordHash: hash },
        });
        this.logger.log(`Admin password reset: ${email}`);
      } else {
        this.logger.log(`Admin already exists: ${email}`);
      }
    } catch (err) {
      this.logger.error(`Bootstrap failed: ${err.message}`);
    }
  }
}
