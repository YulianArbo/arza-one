import type { Prisma } from '../../../generated/prisma/client.js';
import {
  hasPermission,
  hasUnconditionalPermission,
  type AppAbility,
} from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { taskActorOf, type TaskActor } from '../../wf/index.js';

// Lo que cada persona puede ver y hacer con los formatos digitales (B20, numeral 15.4). Quien ve
// todos los documentos ve todos los registros internos; los confidenciales (FT-COM-003) solo los
// ven quien los diligenció, quien aprueba registros y quien gestiona el conocimiento de terceros.
// Quien solo ve lo propio (Colaborador) ve los registros que diligenció.

export interface FormReader {
  readonly userId: string;
  readonly readsAll: boolean;
  readonly managesTemplates: boolean;
  readonly canFill: boolean;
  readonly canApprove: boolean;
  readonly readsConfidential: boolean;
  readonly taskActor: (at: Date) => Promise<TaskActor>;
}

export function formReaderOf(
  tx: TenantTransaction,
  principal: Principal,
  ability: AppAbility,
): FormReader {
  const canApprove = hasPermission(ability, 'doc.form_record.approve');
  let actor: Promise<TaskActor> | null = null;
  return {
    userId: principal.userId,
    readsAll: hasUnconditionalPermission(ability, 'doc.document.read'),
    managesTemplates: hasPermission(ability, 'doc.form_template.manage'),
    canFill: hasPermission(ability, 'doc.form_record.create'),
    canApprove,
    readsConfidential: canApprove || hasPermission(ability, 'party.due_diligence.manage'),
    taskActor: (at) => (actor ??= taskActorOf(tx, principal, ability, at)),
  };
}

/** Registros diligenciados que la persona puede ver. */
export function visibleRecords(reader: FormReader): Prisma.DocFormRecordWhereInput {
  const own: Prisma.DocFormRecordWhereInput = { createdBy: reader.userId };
  if (!reader.readsAll) return { deletedAt: null, ...own };
  if (reader.readsConfidential) return { deletedAt: null };
  return { deletedAt: null, OR: [{ classification: 'internal' }, own] };
}
