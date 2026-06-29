import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { execSync } from 'child_process';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      this.logger.log('Running prisma db push...');
      execSync('npx prisma db push --skip-generate', { cwd: '/app', stdio: 'pipe' });
      this.logger.log('DB schema synced');

      await this.prisma.$connect();
      const email = 'the.ares.p@gmail.com';
      const exists = await this.prisma.user.findUnique({ where: { email } });
      if (!exists) {
        const hash = await bcrypt.hash('Jaredcito2025@1', 10);
        await this.prisma.user.create({
          data: { email, passwordHash: hash, name: 'Admin', role: 'ADMIN' },
        });
        this.logger.log(`Admin created: ${email}`);
      } else {
        this.logger.log(`Admin already exists: ${email}`);
      }
    } catch (err) {
      this.logger.error(`Bootstrap failed: ${err.message}`);
    }
  }
}