import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
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
      this.logger.error(`Seed failed: ${err.message}`);
    }
  }
}