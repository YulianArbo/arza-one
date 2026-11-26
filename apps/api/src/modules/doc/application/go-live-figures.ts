import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { documentsPerRule } from './retention-support.js';

// Lo que la revisión de puesta en marcha (B45, anexo E puntos 16 y 18.2 paso 4) mira de los
// documentos: cuántos documentos del SGC están vigentes (el Listado Maestro cargado) y cuántos
// documentos no tienen regla de retención, ni propia ni por su tipo y su proceso.

export interface DocumentFigures {
  readonly currentControlled: number;
  readonly withoutRetention: number;
}

export async function documentFigures(tx: TenantTransaction): Promise<DocumentFigures> {
  const currentControlled = await tx.docDocument.count({
    where: { isControlled: true, status: 'current', deletedAt: null },
  });
  const perRule = await documentsPerRule(tx);
  return { currentControlled, withoutRetention: perRule.get(null) ?? 0 };
}
