import { ChainVerificationUseCase } from '@arza/api/audit';
import type { Clock, DatabaseService } from '@arza/api/platform';
import { UnrecoverableError } from 'bullmq';

export interface AuditChainCheckDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

/**
 * Verificación diaria de la cadena de la auditoría (ficha 17.20): crea las particiones de los
 * próximos meses y verifica cada empresa. Cada daño ya quedó como evento de seguridad crítico; el
 * trabajo además termina fallido, sin reintento, para que la alerta de trabajos fallidos lo avise
 * (numeral 10.7). Devuelve cuántas empresas revisó.
 */
export async function processAuditChainCheck(deps: AuditChainCheckDependencies): Promise<number> {
  const results = await new ChainVerificationUseCase(deps.database, deps.clock).verifyAllTenants();
  const broken = results.filter((result) => result.problem !== null);
  if (broken.length > 0) {
    const tenants = broken.map((result) => result.tenantId).join(', ');
    throw new UnrecoverableError(`La cadena de la auditoría está dañada en: ${tenants}.`);
  }
  return results.length;
}
