import type { FormEntityType } from '@arza/contracts';

import type { DocFormRecord, DocFormTemplate } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { DocReader } from './doc-support.js';
import { formEntityInvalid } from './form-messages.js';
import type { DocPartyLookup } from './party-lookup.js';
import { findVisibleVersion } from './versions.js';

// El registro al que pertenece un registro diligenciado (B20): la versión que se revisa con el
// FT-SGC-002, el tercero del FT-COM-003 o la solicitud del FT-SGC-001. Los terceros llegan por el
// puerto DOC_PARTY_LOOKUP, como en los expedientes.

export interface EntityRef {
  readonly entityType: FormEntityType | null;
  readonly entityId: string | null;
}

/** Un formato unido a otro registro exige ese registro; uno suelto no admite ninguno. */
export async function assertEntity(
  tx: TenantTransaction,
  context: { readonly reader: DocReader; readonly parties: DocPartyLookup },
  template: DocFormTemplate,
  ref: EntityRef,
): Promise<void> {
  if (template.entityType === null) {
    if (ref.entityType !== null) throw formEntityInvalid('Este formato no se une a otro registro.');
    return;
  }
  if (ref.entityType !== template.entityType || ref.entityId === null) {
    throw formEntityInvalid('Elija el registro al que pertenece este formato.');
  }
  if (ref.entityType === 'doc_version') {
    const { version } = await findVisibleVersion(tx, context.reader, ref.entityId);
    if (version.status !== 'in_review') {
      throw formEntityInvalid(
        'La lista de verificación se diligencia mientras la versión está en revisión.',
      );
    }
    return;
  }
  if (ref.entityType === 'party') {
    const party = (await context.parties.describe(tx, [ref.entityId])).get(ref.entityId);
    if (party?.isCurrent !== true) throw formEntityInvalid('El tercero no existe o se retiró.');
    return;
  }
  throw formEntityInvalid('Solo la plataforma llena un formato desde una solicitud documental.');
}

/** El nombre de cada registro de origen, para mostrarlo junto al registro diligenciado. */
export async function entityLabels(
  tx: TenantTransaction,
  parties: DocPartyLookup,
  records: readonly Pick<DocFormRecord, 'entityType' | 'entityId'>[],
): Promise<Map<string, string>> {
  const idsOf = (type: FormEntityType) =>
    records.flatMap((r) => (r.entityType === type && r.entityId !== null ? [r.entityId] : []));
  const [versions, requests, found] = await Promise.all([
    tx.docVersion.findMany({
      where: { id: { in: idsOf('doc_version') } },
      select: { id: true, versionLabel: true, document: { select: { code: true } } },
    }),
    tx.docChangeRequest.findMany({ where: { id: { in: idsOf('doc_change_request') } } }),
    parties.describe(tx, idsOf('party')),
  ]);
  const labels = new Map<string, string>();
  for (const v of versions) labels.set(v.id, `${v.document.code} versión ${v.versionLabel}`);
  for (const r of requests) labels.set(r.id, `${r.code} · ${r.title}`);
  for (const [id, party] of found) labels.set(id, party.name);
  return labels;
}
