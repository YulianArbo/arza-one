import { Inject, Module, type OnModuleInit } from '@nestjs/common';

import { DocModule } from '../../doc/index.js';

import { AmendmentsUseCase } from '../application/amendments.js';
import { ClauseLibraryUseCase } from '../application/clause-library.js';
import { ContractQueries } from '../application/contract-queries.js';
import { followContractWorkflows } from '../application/contract-seed.js';
import { ContractsUseCase } from '../application/contracts.js';
import { ObligationsUseCase } from '../application/obligations.js';
import { PublicSignaturesUseCase } from '../application/signature-public.js';
import { SignatureVerificationUseCase } from '../application/signature-verification.js';
import { SignaturesUseCase } from '../application/signatures.js';
import { ClausesController } from './clauses.controller.js';
import { ContractFollowUpController } from './contract-follow-up.controller.js';
import { ContractsController } from './contracts.controller.js';
import {
  PublicSignaturesController,
  PublicVerificationsController,
} from './public-signatures.controller.js';
import { SignaturesController } from './signatures.controller.js';
import { PersonalDataRegistry } from '../../privacy/index.js';
import { CONTRACT_PERSONAL_DATA } from '../application/contract-personal-data.js';

/**
 * M06 Contratos (B24): contratos y órdenes de servicio generados desde las plantillas CT-COM y
 * OS-COM con la biblioteca de cláusulas aprobadas, control de cláusulas modificadas, aprobación de
 * la Dirección, PDF definitivo, firma manuscrita digitalizada, obligaciones, otrosíes, prórrogas,
 * terminación y alertas de vencimiento. Desde el B25, la firma electrónica de nivel 2 (enlace único
 * y código al correo) con su paquete de evidencia y la verificación pública (capítulo 19).
 */
@Module({
  imports: [DocModule],
  controllers: [
    ContractsController,
    ContractFollowUpController,
    ClausesController,
    SignaturesController,
    PublicSignaturesController,
    PublicVerificationsController,
  ],
  providers: [
    ContractQueries,
    ContractsUseCase,
    ObligationsUseCase,
    AmendmentsUseCase,
    ClauseLibraryUseCase,
    SignaturesUseCase,
    PublicSignaturesUseCase,
    SignatureVerificationUseCase,
  ],
})
export class ContractModule implements OnModuleInit {
  /** Le presta a Privacidad lo que este módulo guarda de cada titular (B42). */
  constructor(@Inject(PersonalDataRegistry) registry: PersonalDataRegistry) {
    registry.register(CONTRACT_PERSONAL_DATA);
  }

  onModuleInit(): void {
    followContractWorkflows();
  }
}
