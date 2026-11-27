import { PLATFORM_TENANT } from './seed/seed-data.js';

/**
 * Empresa que opera la plataforma (B48): la de ARZA TECH, creada en todos los ambientes. La base de
 * datos la reconoce con core_operator_tenant_id(); este valor debe ser el mismo.
 */
export const OPERATOR_TENANT_ID = PLATFORM_TENANT.id;

export function isOperatorTenant(tenantId: string): boolean {
  return tenantId === OPERATOR_TENANT_ID;
}
