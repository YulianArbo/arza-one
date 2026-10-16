import type { Comment } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { peopleById } from '../../iam/index.js';

type Person = Comment['mentions'][number];

/** Nombre y correo de las personas, para mostrarlas en comentarios y adjuntos. */
export async function peopleViews(
  tx: TenantTransaction,
  ids: readonly (string | null)[],
): Promise<Map<string, Person>> {
  const found = await peopleById(
    tx,
    ids.filter((id): id is string => id !== null),
  );
  return new Map(
    [...found.values()].map((user) => [
      user.id,
      { id: user.id, email: user.email, display_name: user.displayName },
    ]),
  );
}

export function personIn(people: ReadonlyMap<string, Person>, id: string | null): Person | null {
  return id === null ? null : (people.get(id) ?? null);
}
