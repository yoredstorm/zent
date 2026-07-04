import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { VendorNotifyService } from './vendor-notify.service';
import { OpenwaModule } from '../openwa/openwa.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
  imports: [forwardRef(() => OpenwaModule), CustomersModule, InventoryModule, forwardRef(() => WorkflowsModule)],
  controllers: [OrdersController],
  providers: [OrdersService, VendorNotifyService],
  exports: [OrdersService, VendorNotifyService],
})
export class OrdersModule {}