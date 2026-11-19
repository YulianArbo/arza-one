import {
  OFFBOARDING_ITEMS,
  offboardingSchema,
  type Offboarding,
  type OffboardingItem,
} from '@arza/contracts';
import { z } from 'zod';

import type { HrOffboarding } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { assetsHeldBy, type HeldAsset } from '../../asset/index.js';
import { employeeRefsById, refOf, userRefs } from './hr-support.js';

// Lista de chequeo del retiro y lo que se muestra de él (B36, decisión 10). Los activos por devolver
// se preguntan a Activos (B34) en el momento: lo que el colaborador aún tiene a su cargo.

const entrySchema = z.object({
  item: z.enum(Object.keys(OFFBOARDING_ITEMS) as [OffboardingItem, ...OffboardingItem[]]),
  responsible_id: z.uuid().nullable(),
  done_on: z.iso.date().nullable(),
  done_by: z.uuid().nullable(),
  note: z.string().nullable(),
});
export type ChecklistEntry = z.infer<typeof entrySchema>;

export function checklistOf(row: Pick<HrOffboarding, 'checklist'>): ChecklistEntry[] {
  return z.array(entrySchema).parse(row.checklist);
}

/** Activos que aún tiene a su cargo la cuenta del colaborador. */
export async function heldAssets(
  tx: TenantTransaction,
  userId: string | null,
): Promise<HeldAsset[]> {
  return userId === null ? [] : assetsHeldBy(tx, userId);
}

/** Todo listo para el paz y salvo: lista completa, sin activos y la cuenta ya desactivada. */
export function readyToClear(
  row: Pick<HrOffboarding, 'status' | 'accountDeactivatedAt' | 'checklist'>,
  assets: readonly HeldAsset[],
): boolean {
  return (
    row.status === 'in_progress' &&
    row.accountDeactivatedAt !== null &&
    assets.length === 0 &&
    checklistOf(row).every((entry) => entry.done_on !== null)
  );
}

export async function offboardingView(
  tx: TenantTransaction,
  row: HrOffboarding,
  userId: string | null,
): Promise<Offboarding> {
  const entries = checklistOf(row);
  const people = await userRefs(
    tx,
    entries.flatMap(({ responsible_id, done_by }) => [responsible_id, done_by]),
  );
  const employee = (await employeeRefsById(tx, [row.employeeId])).get(row.employeeId);
  const assets = row.status === 'in_progress' ? await heldAssets(tx, userId) : [];
  return offboardingSchema.parse({
    id: row.id,
    employee: employee ?? { id: row.employeeId, name: 'Colaborador' },
    reason: row.reason,
    last_day: toCalendarDate(row.lastDay),
    note: row.note,
    status: row.status,
    checklist: entries.map((entry) => ({
      item: entry.item,
      label: OFFBOARDING_ITEMS[entry.item].label,
      responsible: refOf(people, entry.responsible_id),
      done_on: entry.done_on,
      done_by: refOf(people, entry.done_by),
      note: entry.note,
    })),
    assets: assets.map((asset) => ({
      id: asset.assetId,
      code: asset.code,
      name: asset.name,
      assigned_on: asset.assignedOn,
    })),
    exit_interview_file_id: row.exitInterviewRecordId,
    account_deactivated_at: row.accountDeactivatedAt?.toISOString() ?? null,
    cleared_on: row.clearedOn === null ? null : toCalendarDate(row.clearedOn),
    can_clear: readyToClear(row, assets),
    version: row.version,
  });
}
