import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const email = 'the.ares.p@gmail.com';
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (!exists) {
      const hash = await bcrypt.hash('Jaredcito2025@1', 10);
      await this.prisma.user.create({
        data: { email, passwordHash: hash, name: 'Admin', role: 'ADMIN' },
      });
      console.log(`[Seed] Admin created: ${email}`);
    }
  }
}