import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule implements OnModuleInit {
  private readonly logger = new Logger(CustomersModule.name);

  constructor(private customers: CustomersService) {}

  async onModuleInit() {
    try {
      const result = await this.customers.backfillFromOrders();
      if (result.migrated > 0) {
        this.logger.log(`Backfilled ${result.migrated} orders with customer records`);
      }
    } catch (err: any) {
      this.logger.warn(`Customer backfill skipped: ${err?.message}`);
    }
  }
}
