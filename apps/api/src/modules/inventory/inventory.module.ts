import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { StockReservationService } from './stock-reservation.service';
import { CartHoldService } from './cart-hold.service';
import { CartExpiryReminderService } from './cart-expiry-reminder.service';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [InventoryController],
  providers: [InventoryService, StockReservationService, CartHoldService, CartExpiryReminderService],
  exports: [InventoryService, StockReservationService, CartHoldService],
})
export class InventoryModule {}
