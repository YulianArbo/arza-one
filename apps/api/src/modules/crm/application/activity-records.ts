import {
  activityTypeSchema,
  type CrmActivity as ActivityView,
  type CrmActivityRecord,
  type PermissionCode,
} from '@arza/contracts';

import type { CrmActivity, Prisma } from '../../../generated/prisma/client.js';
import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { commercialParties } from '../../party/index.js';
import { crmNotFound, statusInvalid } from './crm-messages.js';
import { peopleNames, personRef } from './crm-support.js';

// Piezas de las actividades (B22): de qué registro son, quién puede verlas o cambiarlas y cómo se
// muestran. Una actividad de un prospecto se rige por los permisos de prospectos; una de una
// oportunidad, por los de oportunidades.

export type ActivityAccess = 'read' | 'update';

const PERMISSIONS: Readonly<
  Record<CrmActivityRecord['kind'], Record<ActivityAccess, PermissionCode>>
> = {
  lead: { read: 'crm.lead.read', update: 'crm.lead.update' },
  opportunity: { read: 'crm.opportunity.read', update: 'crm.opportunity.update' },
};

export function kindOf(activity: Pick<CrmActivity, 'leadId'>): CrmActivityRecord['kind'] {
  return activity.leadId === null ? 'opportunity' : 'lead';
}

/** Sin el permiso del tipo de registro, 403 sin revelar nada más. */
export function assertActivityAccess(
  ability: AppAbility,
  kind: CrmActivityRecord['kind'],
  access: ActivityAccess,
): void {
  if (!hasPermission(ability, PERMISSIONS[kind][access])) throw permissionDenied();
}

export async function findActivity(tx: TenantTransaction, id: string): Promise<CrmActivity> {
  const activity = await tx.crmActivity.findFirst({ where: { id, deletedAt: null } });
  if (activity === null) throw crmNotFound('La actividad');
  return activity;
}

export function assertPending(activity: CrmActivity): void {
  if (activity.doneAt !== null) throw statusInvalid('La actividad ya se hizo: no cambia.');
}

export async function updateActivityVersioned(
  tx: TenantTransaction,
  target: { readonly id: string; readonly version: number },
  data: Prisma.CrmActivityUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.crmActivity.updateMany({
    where: { id: target.id, version: target.version, deletedAt: null },
    data,
  });
  if (count === 0) throw versionConflict();
}

type WithRecord = CrmActivity & {
  readonly lead: { readonly code: string; readonly partyId: string } | null;
  readonly opportunity: { readonly code: string; readonly title: string } | null;
};

export const WITH_RECORD = {
  lead: { select: { code: true, partyId: true } },
  opportunity: { select: { code: true, title: true } },
} satisfies Prisma.CrmActivityInclude;

function recordOf(activity: WithRecord, names: ReadonlyMap<string, string>): CrmActivityRecord {
  if (activity.lead !== null && activity.leadId !== null) {
    const label = names.get(activity.lead.partyId) ?? 'Prospecto';
    return { kind: 'lead', id: activity.leadId, code: activity.lead.code, label };
  }
  const opportunity = activity.opportunity ?? { code: '', title: '' };
  const id = activity.opportunityId ?? activity.id;
  return { kind: 'opportunity', id, code: opportunity.code, label: opportunity.title };
}

/** Las actividades como las ve la pantalla, con su registro y su responsable. */
export async function activityViews(
  tx: TenantTransaction,
  activities: readonly WithRecord[],
): Promise<ActivityView[]> {
  const [people, parties] = await Promise.all([
    peopleNames(
      tx,
      activities.map((activity) => activity.assigneeId),
    ),
    commercialParties(
      tx,
      activities.flatMap((activity) => (activity.lead === null ? [] : [activity.lead.partyId])),
    ),
  ]);
  const names = new Map([...parties].map(([id, party]) => [id, party.name]));
  return activities.map((activity) => ({
    id: activity.id,
    type: activityTypeSchema.parse(activity.type),
    subject: activity.subject,
    notes: activity.notes,
    due_at: activity.dueAt.toISOString(),
    done_at: activity.doneAt?.toISOString() ?? null,
    outcome: activity.outcome,
    assignee: personRef(people, activity.assigneeId),
    record: recordOf(activity, names),
    version: activity.version,
  }));
}
