import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { VendorNotifyService } from './vendor-notify.service';
import { OpenwaModule } from '../openwa/openwa.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [forwardRef(() => OpenwaModule), CustomersModule, InventoryModule],
  controllers: [OrdersController],
  providers: [OrdersService, VendorNotifyService],
  exports: [OrdersService],
})
export class OrdersModule {}