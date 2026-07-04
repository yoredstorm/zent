import { Module, forwardRef } from '@nestjs/common';
import { WorkflowEventsService } from './workflow-events.service';
import { WorkflowCallbackController } from './workflow-callback.controller';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [WorkflowCallbackController],
  providers: [WorkflowEventsService],
  exports: [WorkflowEventsService],
})
export class WorkflowsModule {}
