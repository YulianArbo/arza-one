import type { Committee } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { fromCalendarDate } from '../../core/index.js';

// Quién integra hoy cada comité (B37, decisión 8). El periodo incluye su último día.

function activeOn(today: string) {
  const day = fromCalendarDate(today);
  return {
    deletedAt: null,
    fromOn: { lte: day },
    OR: [{ untilOn: null }, { untilOn: { gte: day } }],
  };
}

export async function isActiveMember(
  tx: TenantTransaction,
  userId: string,
  committee: Committee,
  today: string,
): Promise<boolean> {
  const count = await tx.sstCommitteeMember.count({
    where: { userId, committee, ...activeOn(today) },
  });
  return count > 0;
}

/** Los comités a los que pertenece hoy la persona. */
export async function committeesOf(
  tx: TenantTransaction,
  userId: string,
  today: string,
): Promise<Committee[]> {
  const rows = await tx.sstCommitteeMember.findMany({
    where: { userId, ...activeOn(today) },
    select: { committee: true },
  });
  return [...new Set(rows.map((row) => row.committee as Committee))].sort();
}

/** Las cuentas de los integrantes vigentes del comité. */
export async function activeMemberIds(
  tx: TenantTransaction,
  committee: Committee,
  today: string,
): Promise<string[]> {
  const rows = await tx.sstCommitteeMember.findMany({
    where: { committee, ...activeOn(today) },
    select: { userId: true },
  });
  return [...new Set(rows.map((row) => row.userId))];
}
