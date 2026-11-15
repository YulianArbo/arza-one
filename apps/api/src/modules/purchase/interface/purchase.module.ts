import { Module } from '@nestjs/common';

import { PurchaseOrdersUseCase } from '../application/orders.js';
import { PurchaseQuotesUseCase } from '../application/quotes.js';
import { PurchaseRequestsUseCase } from '../application/requests.js';
import { SupplierEvaluationsUseCase } from '../application/supplier-evaluations.js';
import { TravelUseCase } from '../application/travel.js';
import {
  PurchaseOrdersController,
  PurchaseQuotesController,
  SupplierEvaluationsController,
} from './orders.controller.js';
import { PurchaseRequestsController } from './requests.controller.js';
import { TravelLegalizationController, TravelRequestsController } from './travel.controller.js';

/**
 * M11 Compras, proveedores y viajes (B33): solicitudes con aprobación por montos, cotizaciones y
 * cuadro comparativo, órdenes, recepciones, evaluación de proveedores y viajes con su
 * legalización. Los activos llegan en el B34.
 */
@Module({
  controllers: [
    PurchaseRequestsController,
    PurchaseQuotesController,
    PurchaseOrdersController,
    SupplierEvaluationsController,
    TravelRequestsController,
    TravelLegalizationController,
  ],
  providers: [
    PurchaseRequestsUseCase,
    PurchaseQuotesUseCase,
    PurchaseOrdersUseCase,
    SupplierEvaluationsUseCase,
    TravelUseCase,
  ],
})
export class PurchaseModule {}
