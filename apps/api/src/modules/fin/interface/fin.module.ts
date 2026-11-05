import { Module } from '@nestjs/common';

import { TaxParametersUseCase } from '../application/tax-parameters.js';
import { TaxParametersController } from './tax-parameters.controller.js';

/**
 * M10 Finanzas. Por ahora solo los parámetros tributarios vigentes, adelantados en B23 porque las
 * cotizaciones calculan el impuesto con ellos; el resto del módulo llega en B31.
 */
@Module({
  controllers: [TaxParametersController],
  providers: [TaxParametersUseCase],
})
export class FinModule {}
