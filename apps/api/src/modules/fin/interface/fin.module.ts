import { Module } from '@nestjs/common';

import { AccountingUseCase } from '../application/accounting.js';
import { BudgetsUseCase } from '../application/budgets.js';
import { CostCertificationsUseCase } from '../application/cost-certifications.js';
import { ExpensesUseCase } from '../application/expenses.js';
import { InvoicesUseCase } from '../application/invoices.js';
import { PettyCashUseCase } from '../application/petty-cash.js';
import { ReconciliationsUseCase } from '../application/reconciliations.js';
import { TaxParametersUseCase } from '../application/tax-parameters.js';
import { AccountingController } from './accounting.controller.js';
import { BudgetsController } from './budgets.controller.js';
import { ExpensesController } from './expenses.controller.js';
import { InvoicesController } from './invoices.controller.js';
import { TaxParametersController } from './tax-parameters.controller.js';

/**
 * M10 Finanzas. Los parámetros tributarios se adelantaron en B23; facturas, notas crédito y
 * recaudos se incorporan en B31; presupuesto, gastos, caja menor, conciliación, certificación de
 * costos, cierre de periodo y exportación contable en B32.
 */
@Module({
  controllers: [
    TaxParametersController,
    InvoicesController,
    BudgetsController,
    ExpensesController,
    AccountingController,
  ],
  providers: [
    TaxParametersUseCase,
    InvoicesUseCase,
    BudgetsUseCase,
    ExpensesUseCase,
    PettyCashUseCase,
    ReconciliationsUseCase,
    CostCertificationsUseCase,
    AccountingUseCase,
  ],
})
export class FinModule {}
