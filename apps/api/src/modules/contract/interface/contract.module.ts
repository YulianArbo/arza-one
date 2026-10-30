import { Module, type OnModuleInit } from '@nestjs/common';

import { DocModule } from '../../doc/index.js';

import { AmendmentsUseCase } from '../application/amendments.js';
import { ClauseLibraryUseCase } from '../application/clause-library.js';
import { ContractQueries } from '../application/contract-queries.js';
import { followContractWorkflows } from '../application/contract-seed.js';
import { ContractsUseCase } from '../application/contracts.js';
import { ObligationsUseCase } from '../application/obligations.js';
import { ClausesController } from './clauses.controller.js';
import { ContractFollowUpController } from './contract-follow-up.controller.js';
import { ContractsController } from './contracts.controller.js';

/**
 * M06 Contratos (B24): contratos y órdenes de servicio generados desde las plantillas CT-COM y
 * OS-COM con la biblioteca de cláusulas aprobadas, control de cláusulas modificadas, aprobación de
 * la Dirección, PDF definitivo, firma manuscrita digitalizada, obligaciones, otrosíes, prórrogas,
 * terminación y alertas de vencimiento. La firma electrónica llega con el B25.
 */
@Module({
  imports: [DocModule],
  controllers: [ContractsController, ContractFollowUpController, ClausesController],
  providers: [
    ContractQueries,
    ContractsUseCase,
    ObligationsUseCase,
    AmendmentsUseCase,
    ClauseLibraryUseCase,
  ],
})
export class ContractModule implements OnModuleInit {
  onModuleInit(): void {
    followContractWorkflows();
  }
}
