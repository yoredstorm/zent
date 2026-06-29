import { Module } from '@nestjs/common';
import { CatalogPdfService } from './catalog-pdf.service';
import { CatalogPdfController } from './catalog-pdf.controller';

@Module({
  controllers: [CatalogPdfController],
  providers: [CatalogPdfService],
  exports: [CatalogPdfService],
})
export class CatalogPdfModule {}