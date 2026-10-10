import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { peopleById } from '../../iam/index.js';

// Quién registró y quién revisó una cuenta bancaria o un conocimiento del tercero, con su nombre
// (módulo de identidad, por su interfaz pública).

export type People = Awaited<ReturnType<typeof peopleById>>;

interface ReviewedRow {
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly reviewNote: string | null;
}

interface PersonRef {
  readonly id: string;
  readonly display_name: string | null;
}

interface ReviewFields {
  readonly requested_by: PersonRef | null;
  readonly requested_at: string;
  readonly reviewed_by: PersonRef | null;
  readonly reviewed_at: string | null;
  readonly review_note: string | null;
}

function personRef(people: People, id: string | null): PersonRef | null {
  if (id === null) return null;
  return { id, display_name: people.get(id)?.displayName ?? null };
}

export async function peopleOf(
  tx: TenantTransaction,
  rows: readonly ReviewedRow[],
): Promise<People> {
  return peopleById(
    tx,
    rows.flatMap((row) => [row.createdBy, row.reviewedBy].flatMap((id) => id ?? [])),
  );
}

export function reviewFields(people: People, row: ReviewedRow): ReviewFields {
  return {
    requested_by: personRef(people, row.createdBy),
    requested_at: row.createdAt.toISOString(),
    reviewed_by: personRef(people, row.reviewedBy),
    reviewed_at: row.reviewedAt?.toISOString() ?? null,
    review_note: row.reviewNote,
  };
}
