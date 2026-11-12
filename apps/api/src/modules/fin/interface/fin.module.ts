import { Module } from '@nestjs/common';

import { TaxParametersUseCase } from '../application/tax-parameters.js';
import { InvoicesUseCase } from '../application/invoices.js';
import { InvoicesController } from './invoices.controller.js';
import { TaxParametersController } from './tax-parameters.controller.js';

/**
 * M10 Finanzas. Los parámetros tributarios se adelantaron en B23; facturas, notas crédito y
 * recaudos se incorporan en B31. Los valores fiscales se capturan desde el documento externo.
 */
@Module({
  controllers: [TaxParametersController, InvoicesController],
  providers: [TaxParametersUseCase, InvoicesUseCase],
})
export class FinModule {}
