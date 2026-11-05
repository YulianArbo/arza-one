import {
  commentableEntityTypeSchema,
  type CommentableEntityType,
  type PermissionCode,
  type RecordRef,
} from '@arza/contracts';

import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { visibleContractTitle } from '../../contract/index.js';
import { visiblePartyName } from '../../party/index.js';
import { visibleInstanceTitle } from '../../wf/index.js';
import { recordNotFound } from './ntf-messages.js';

// Quién ve y quién escribe en los comentarios y adjuntos de un registro (B16). Lo decide el módulo
// dueño del registro: con su permiso de lectura se ven; para escribir hace falta además poder
// trabajar en él (el Auditor, que solo lee, no comenta). Si la persona no ve el registro, para
// ella «no existe» (numeral 15.5).

export interface RecordAccess {
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly now: Date;
}

interface RecordType {
  readonly read: readonly PermissionCode[];
  readonly write: readonly PermissionCode[];
  /** Cómo se nombra el registro en un aviso, si la persona lo puede ver. */
  readonly label: (
    tx: TenantTransaction,
    access: RecordAccess,
    id: string,
  ) => Promise<string | null>;
  readonly link: (id: string) => string;
}

const RECORD_TYPES: Readonly<Record<CommentableEntityType, RecordType>> = {
  party: {
    read: ['party.read'],
    write: ['party.create', 'party.update'],
    label: async (tx, access, id) => {
      const name = await visiblePartyName(tx, access.principal, access.ability, id);
      return name === null ? null : `el tercero «${name}»`;
    },
    link: (id) => `/app/terceros/${id}`,
  },
  wf_instance: {
    read: ['wf.task.work', 'wf.task.read_all'],
    write: ['wf.task.work'],
    label: async (tx, access, id) => {
      const { principal, ability, now } = access;
      const title = await visibleInstanceTitle(tx, principal, ability, id, now);
      return title === null ? null : `el trámite «${title}»`;
    },
    link: (id) => `/app/mis-tareas/tramites/${id}`,
  },
  // B24: los anexos y comentarios del expediente contractual.
  ctr_contract: {
    read: ['contract.read'],
    write: ['contract.update'],
    label: async (tx, access, id) => {
      const title = await visibleContractTitle(tx, access.ability, id);
      return title === null ? null : `el contrato «${title}»`;
    },
    link: (id) => `/app/contratos/${id}`,
  },
};

export interface RecordFacts {
  readonly label: string;
  readonly link: string;
}

/** Verifica el permiso y que la persona vea el registro. Responde 403 o 404 si no. */
export async function recordFor(
  tx: TenantTransaction,
  access: RecordAccess,
  ref: RecordRef,
  mode: 'read' | 'write',
): Promise<RecordFacts> {
  const type = RECORD_TYPES[ref.entity_type];
  if (!type[mode].some((code) => hasPermission(access.ability, code))) throw permissionDenied();
  const label = await type.label(tx, access, ref.entity_id);
  if (label === null) throw recordNotFound();
  return { label, link: type.link(ref.entity_id) };
}

/** Registro al que pertenece un comentario o un adjunto. */
export function refOf(row: { readonly entityType: string; readonly entityId: string }): RecordRef {
  return {
    entity_type: commentableEntityTypeSchema.parse(row.entityType),
    entity_id: row.entityId,
  };
}
