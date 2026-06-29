import { Module, OnModuleInit } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule implements OnModuleInit {
  constructor(private customers: CustomersService) {}

  async onModuleInit() {
    await this.customers.backfillFromOrders();
  }
}
