import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProductsModule } from './modules/products/products.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { OrdersModule } from './modules/orders/orders.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { ReportsModule } from './modules/reports/reports.module';
import { WhatsappInboxModule } from './modules/whatsapp-inbox/whatsapp-inbox.module';
import { OpenwaModule } from './modules/openwa/openwa.module';
import { WhatsappBotModule } from './modules/whatsapp-bot/whatsapp-bot.module';
import { CatalogPdfModule } from './modules/catalog-pdf/catalog-pdf.module';
import { CustomersModule } from './modules/customers/customers.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { SetupModule } from './modules/setup/setup.module';
import { HealthController } from './health.controller';
import { SeedService } from './seed.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    ProductsModule,
    CategoriesModule,
    OrdersModule,
    InventoryModule,
    RealtimeModule,
    WhatsappInboxModule,
    ReportsModule,
    OpenwaModule,
    WhatsappBotModule,
    CatalogPdfModule,
    UploadsModule,
    CustomersModule,
    AnalyticsModule,
    SetupModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, SeedService],
})
export class AppModule {}