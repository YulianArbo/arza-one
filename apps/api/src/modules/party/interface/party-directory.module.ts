import { Global, Module } from '@nestjs/common';

import { DOC_PARTY_LOOKUP } from '../../doc/index.js';
import { PARTY_DIRECTORY } from '../../privacy/index.js';
import { PARTY_RECORDS } from '../application/party-consents.js';

/**
 * Le presta a privacidad la consulta de terceros para mostrar a los titulares y validar los
 * encargados, y a la gestión documental para los expedientes y los vínculos (B18). Es global
 * porque esos módulos no importan el módulo de terceros.
 */
@Global()
@Module({
  providers: [
    { provide: PARTY_DIRECTORY, useValue: PARTY_RECORDS },
    { provide: DOC_PARTY_LOOKUP, useValue: PARTY_RECORDS },
  ],
  exports: [PARTY_DIRECTORY, DOC_PARTY_LOOKUP],
})
export class PartyDirectoryModule {}
