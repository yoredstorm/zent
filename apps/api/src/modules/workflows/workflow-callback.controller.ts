import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  BadRequestException,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { OrdersService } from '../orders/orders.service';
import { WorkflowEventsService } from './workflow-events.service';

@ApiTags('webhooks')
@Controller('webhooks/n8n')
export class WorkflowCallbackController {
  constructor(
    private workflows: WorkflowEventsService,
    private orders: OrdersService,
  ) {}

  @Post('order-status')
  @Public()
  @ApiOperation({ summary: 'n8n callback to update order status' })
  async updateOrderStatus(
    @Body() body: { orderId?: string; status?: OrderStatus; note?: string },
    @Headers('x-zent-signature') signature?: string,
    @Req() req?: RawBodyRequest<Request>,
  ) {
    const payload = req?.rawBody?.toString('utf8') ?? JSON.stringify(body ?? {});
    if (!this.workflows.verifySignature(payload, signature)) {
      throw new UnauthorizedException('Invalid n8n signature');
    }

    if (!body?.orderId || !body?.status || !(body.status in OrderStatus)) {
      throw new BadRequestException('orderId and valid status are required');
    }

    return this.orders.updateStatus(body.orderId, {
      status: body.status,
      notes: body.note,
    });
  }
}
