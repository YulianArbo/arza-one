import { Global, Module } from '@nestjs/common';

import { TENANT_GATE, type TenantGate } from '../../iam/index.js';
import { tenantIsOpen } from '../application/tenant-plan.js';

const gate: TenantGate = { isOpen: tenantIsOpen };

/**
 * Le presta a identidad la pregunta «¿la empresa está activa?» para el inicio de sesión y cada
 * petición (B48). Es global porque identidad no importa el módulo del núcleo.
 */
@Global()
@Module({
  providers: [{ provide: TENANT_GATE, useValue: gate }],
  exports: [TENANT_GATE],
})
export class TenantGateModule {}
