import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { StockReservationService } from './stock-reservation.service';
import { CartHoldService } from './cart-hold.service';
import { CartExpiryReminderService } from './cart-expiry-reminder.service';
import { AbandonedCartService } from './abandoned-cart.service';
import { AbandonedCartFollowupService } from './abandoned-cart-followup.service';

@Module({
  controllers: [InventoryController],
  providers: [
    InventoryService,
    StockReservationService,
    CartHoldService,
    CartExpiryReminderService,
    AbandonedCartService,
    AbandonedCartFollowupService,
  ],
  exports: [InventoryService, StockReservationService, CartHoldService, AbandonedCartService],
})
export class InventoryModule {}
