// Jerarquías del organigrama (procesos dentro de procesos, cargos que reportan a cargos): nadie
// puede quedar por encima de sí mismo.

/**
 * Si poner `parentId` por encima de `id` cerraría un ciclo. `parentOf` da el superior actual de
 * cada registro, o null en la cabeza.
 */
export function createsCycle(
  id: string,
  parentId: string | null,
  parentOf: ReadonlyMap<string, string | null>,
): boolean {
  const seen = new Set<string>();
  let current = parentId;
  while (current !== null && !seen.has(current)) {
    if (current === id) return true;
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return false;
}
