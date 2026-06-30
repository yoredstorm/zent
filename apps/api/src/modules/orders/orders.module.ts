import { Module, forwardRef } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OpenwaModule } from '../openwa/openwa.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [forwardRef(() => OpenwaModule), CustomersModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}