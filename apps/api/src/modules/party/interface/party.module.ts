import { Module } from '@nestjs/common';

import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import { BankAccountsUseCase } from '../application/bank-accounts.js';
import { ContactsUseCase } from '../application/contacts.js';
import { DueDiligenceUseCase } from '../application/due-diligence.js';
import { MergeUseCase } from '../application/merge.js';
import { PartiesUseCase } from '../application/parties.js';
import { PartyConsentsUseCase } from '../application/party-consents.js';
import { PartyLogoUseCase } from '../application/party-logo.js';
import { PartyQueries } from '../application/party-queries.js';
import { TimelineUseCase } from '../application/timeline.js';
import { PartiesController } from './parties.controller.js';
import { PartyLogoController } from './party-logo.controller.js';
import { PartyDirectoryModule } from './party-directory.module.js';
import { PartyRecordsController } from './party-records.controller.js';

/**
 * M02 Terceros (B13): ficha única de persona u organización, papeles, contactos y firmantes,
 * cuentas bancarias cifradas con doble aprobación, conocimiento del tercero, línea de tiempo y
 * fusión de duplicados.
 */
@Module({
  imports: [PartyDirectoryModule],
  controllers: [PartiesController, PartyLogoController, PartyRecordsController],
  providers: [
    PartyQueries,
    PartiesUseCase,
    PartyConsentsUseCase,
    PartyLogoUseCase,
    ContactsUseCase,
    BankAccountsUseCase,
    DueDiligenceUseCase,
    MergeUseCase,
    TimelineUseCase,
    // Los números de cuenta se cifran con FIELD_ENCRYPTION_KEY (capítulo 12.1).
    {
      provide: FieldCipher,
      useFactory: (config: Env) => new FieldCipher(config.FIELD_ENCRYPTION_KEY),
      inject: [CONFIG],
    },
  ],
})
export class PartyModule {}
