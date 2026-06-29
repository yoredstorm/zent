import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { ReportsModule } from '../reports/reports.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [ReportsModule, CustomersModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
