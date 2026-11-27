import { HttpStatus } from '@nestjs/common';
import { TENANCY_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Puerta de la empresa (B48): una empresa suspendida o cerrada no entra. El núcleo dueño de
// core_tenants la implementa (TenantGateModule); identidad solo la pregunta, como POSITION_DIRECTORY.

export interface TenantGate {
  /** La empresa del contexto de la transacción está activa. */
  isOpen(tx: TenantTransaction): Promise<boolean>;
}

export const TENANT_GATE = Symbol('TENANT_GATE');

export function tenantSuspended(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    TENANCY_ERROR_CODES.tenantSuspended,
    'El acceso de su empresa a ARZA ONE está suspendido. Comuníquese con el administrador de su empresa.',
  );
}
