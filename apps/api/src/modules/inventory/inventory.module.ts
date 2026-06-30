import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { StockReservationService } from './stock-reservation.service';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [InventoryController],
  providers: [InventoryService, StockReservationService],
  exports: [InventoryService, StockReservationService],
})
export class InventoryModule {}