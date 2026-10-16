import { Global, Module } from '@nestjs/common';

import { PARTY_DIRECTORY } from '../../privacy/index.js';
import { PARTY_RECORDS } from '../application/party-consents.js';

/**
 * Le presta a privacidad la consulta de terceros para mostrar a los titulares y validar los
 * encargados. Es global porque privacidad no importa el módulo de terceros.
 */
@Global()
@Module({
  providers: [{ provide: PARTY_DIRECTORY, useValue: PARTY_RECORDS }],
  exports: [PARTY_DIRECTORY],
})
export class PartyDirectoryModule {}
