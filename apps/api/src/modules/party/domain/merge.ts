// Fusión de duplicados (ficha 17.3): lo que tenía el duplicado pasa al tercero que se conserva,
// sin repetir papeles ni contactos. El duplicado queda marcado y su historial se sigue viendo.

export type MergeProblem = 'same_party' | 'different_kind';

interface MergeSide {
  readonly id: string;
  readonly kind: string;
}

export function mergeProblem(survivor: MergeSide, duplicate: MergeSide): MergeProblem | null {
  if (survivor.id === duplicate.id) return 'same_party';
  return survivor.kind === duplicate.kind ? null : 'different_kind';
}

interface RoleRow {
  readonly id: string;
  readonly role: string;
  readonly status: string;
}

export interface RoleMergePlan {
  /** Papeles del duplicado que el que se conserva no tenía: pasan tal cual. */
  readonly move: string[];
  /** Papeles repetidos del duplicado: se retiran. */
  readonly retire: string[];
  /** Papeles terminados del que se conserva que seguían vigentes en el duplicado: se reactivan. */
  readonly reactivate: string[];
}

export function roleMergePlan(
  survivor: readonly RoleRow[],
  duplicate: readonly RoleRow[],
): RoleMergePlan {
  const plan: RoleMergePlan = { move: [], retire: [], reactivate: [] };
  for (const row of duplicate) {
    const kept = survivor.find((candidate) => candidate.role === row.role);
    if (kept === undefined) {
      plan.move.push(row.id);
      continue;
    }
    plan.retire.push(row.id);
    if (row.status === 'active' && kept.status !== 'active') plan.reactivate.push(kept.id);
  }
  return plan;
}

interface ContactRow {
  readonly id: string;
  readonly organizationId: string;
  readonly personId: string;
}

export interface ContactMergePlan {
  /** Contactos que se reasignan al tercero que se conserva. */
  readonly move: string[];
  /** Contactos que quedarían repetidos o del tercero consigo mismo: se retiran. */
  readonly retire: string[];
}

/**
 * Contactos donde aparece el duplicado, como organización o como persona. Tras cambiar el
 * duplicado por el que se conserva, una pareja organización–persona que ya existe, o que repite
 * al mismo tercero en los dos lados, se retira.
 */
export function contactMergePlan(
  survivorId: string,
  duplicateId: string,
  contacts: readonly ContactRow[],
): ContactMergePlan {
  const swap = (id: string) => (id === duplicateId ? survivorId : id);
  const pairs = new Set(
    contacts
      .filter((row) => row.organizationId !== duplicateId && row.personId !== duplicateId)
      .map((row) => `${row.organizationId}/${row.personId}`),
  );
  const plan: ContactMergePlan = { move: [], retire: [] };
  for (const row of contacts) {
    if (row.organizationId !== duplicateId && row.personId !== duplicateId) continue;
    const organizationId = swap(row.organizationId);
    const personId = swap(row.personId);
    const pair = `${organizationId}/${personId}`;
    if (organizationId === personId || pairs.has(pair)) {
      plan.retire.push(row.id);
    } else {
      pairs.add(pair);
      plan.move.push(row.id);
    }
  }
  return plan;
}
