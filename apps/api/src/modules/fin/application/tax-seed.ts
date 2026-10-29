import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { fromCalendarDate } from '../../core/index.js';

// Semilla de los parámetros tributarios (B23). Crea solo los impuestos que la empresa no tiene, así
// que se puede repetir sin deshacer lo que el Contador cambió. Las tarifas son las del Estatuto
// Tributario a la fecha y quedan marcadas para que el Contador las valide (ficha 17.6).

const VALID_FROM = '2026-01-01';

export const TAX_PARAMETER_SEED = [
  {
    key: 'IVA_GENERAL',
    label: 'IVA general',
    rate: '19.00',
    legalBasis: 'Estatuto Tributario, art. 468. Por validar por el Contador.',
  },
  {
    key: 'IVA_EXENTO',
    label: 'Sin IVA (exento o excluido)',
    rate: '0.00',
    legalBasis: 'Estatuto Tributario, arts. 476 y 477. Por validar por el Contador.',
  },
] as const;

export async function seedTaxParameters(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    await database.withTenant({ tenantId, userId: null }, async (tx) => {
      const known = new Set(
        (await tx.finTaxParameter.findMany({ select: { key: true } })).map((row) => row.key),
      );
      const missing = TAX_PARAMETER_SEED.filter((seed) => !known.has(seed.key));
      if (missing.length === 0) return;
      await tx.finTaxParameter.createMany({
        data: missing.map((seed) => ({
          tenantId,
          key: seed.key,
          label: seed.label,
          rate: seed.rate,
          legalBasis: seed.legalBasis,
          validFrom: fromCalendarDate(VALID_FROM),
        })),
      });
      await recordAuditEvent(tx, {
        tenantId,
        occurredAt: clock.now(),
        actor: { kind: 'system' },
        action: 'finance.tax_parameter.seed',
        entityType: 'fin_seed',
        entityId: null,
        result: 'success',
        changes: { keys: missing.map((seed) => seed.key), valid_from: VALID_FROM },
        meta: null,
      });
    });
  }
}
