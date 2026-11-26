import { businessCodeSchema, recordNameSchema } from '@arza/contracts';

import { nameKey, type KnownRef, type KnownStructure, type Ref } from './known.js';
import {
  normalizedHeader,
  readSheet,
  repeatedKeys,
  type Cells,
  type SheetColumns,
  type SheetProblem,
} from './sheet.js';

// Plantillas «areas.csv» y «cargos.csv» de la carga inicial (B45, decisión 1). La semilla ya trae el
// organigrama DC-SGC-001: lo que ya existe se informa y no se toca; lo nuevo se agrega en un orden
// en que cada proceso existe antes que los que dependen de él y cada jefe antes que su equipo.

type AreaColumn = 'code' | 'name' | 'kind' | 'parent' | 'owner';
type PositionColumn = 'name' | 'unit' | 'boss';

export const AREA_COLUMNS: SheetColumns<AreaColumn> = {
  headers: {
    code: ['codigo'],
    name: ['nombre'],
    kind: ['tipo'],
    parent: ['depende', 'dependede', 'procesopadre'],
    owner: ['cargolider', 'lider'],
  },
  required: ['code', 'name', 'kind'],
  labels: {
    code: 'Código',
    name: 'Nombre',
    kind: 'Tipo',
    parent: 'Depende de',
    owner: 'Cargo líder',
  },
};

export const POSITION_COLUMNS: SheetColumns<PositionColumn> = {
  headers: {
    name: ['cargo', 'nombre'],
    unit: ['procesoarea', 'proceso', 'area'],
    boss: ['reportaa'],
  },
  required: ['name', 'unit'],
  labels: { name: 'Cargo', unit: 'Proceso o área', boss: 'Reporta a' },
};

const KINDS: Readonly<Record<string, 'area' | 'process'>> = {
  area: 'area',
  proceso: 'process',
};

export interface PlannedUnit {
  readonly row: number;
  readonly code: string;
  readonly name: string;
  readonly kind: 'area' | 'process';
  readonly parent: Ref | null;
  readonly owner: Ref | null;
}

export interface PlannedPosition {
  readonly row: number;
  readonly name: string;
  readonly unit: Ref;
  readonly boss: Ref | null;
}

export interface StructurePlan {
  /** En orden: cada proceso o área después del que lo contiene. */
  readonly units: readonly PlannedUnit[];
  /** En orden: cada cargo después de aquel al que reporta. */
  readonly positions: readonly PlannedPosition[];
  readonly existingUnits: number;
  readonly existingPositions: number;
  readonly problems: readonly SheetProblem[];
}

interface Draft<T> {
  readonly item: T;
  readonly key: string;
  readonly dependsOn: string | null;
}

/** Ordena para que cada uno quede después del que necesita; los que forman un ciclo sobran. */
function inDependencyOrder<T>(drafts: readonly Draft<T>[]): { ordered: T[]; cyclic: T[] } {
  const pending = new Map(drafts.map((draft) => [draft.key, draft]));
  const ordered: T[] = [];
  let progressed = true;
  while (pending.size > 0 && progressed) {
    progressed = false;
    for (const [key, draft] of pending) {
      if (draft.dependsOn !== null && pending.has(draft.dependsOn)) continue;
      ordered.push(draft.item);
      pending.delete(key);
      progressed = true;
    }
  }
  return { ordered, cyclic: [...pending.values()].map((draft) => draft.item) };
}

class Problems {
  readonly list: SheetProblem[] = [];
  add(row: number, key: string | null, problem: string): void {
    this.list.push({ row, key, problem });
  }
}

/** Busca un cargo por su nombre: uno que ya existe o uno nuevo de la plantilla. */
function positionRef(known: KnownStructure, fresh: ReadonlySet<string>, name: string): KnownRef {
  const key = nameKey(name);
  const matches = known.positions.filter((position) => nameKey(position.name) === key);
  if (matches.length > 1) return { problem: `hay más de un cargo llamado «${name}»` };
  const match = matches[0];
  if (match !== undefined)
    return { ref: { kind: 'existing', id: match.id }, active: match.isActive };
  if (fresh.has(key)) return { ref: { kind: 'new', key }, active: true };
  return { problem: `el cargo «${name}» no existe ni está en cargos.csv` };
}

function unitRef(known: KnownStructure, fresh: ReadonlySet<string>, code: string): KnownRef {
  const unit = known.units.get(code);
  if (unit === null) return { problem: `el proceso o área ${code} se eliminó` };
  if (unit !== undefined) return { ref: { kind: 'existing', id: unit.id }, active: unit.isActive };
  if (fresh.has(code)) return { ref: { kind: 'new', key: code }, active: true };
  return { problem: `el proceso o área ${code} no existe ni está en areas.csv` };
}

interface AreaRow {
  readonly row: number;
  readonly code: string;
  readonly cells: Cells<AreaColumn>;
}

function areaOf(
  found: AreaRow,
  kind: 'area' | 'process',
  refs: {
    readonly parent: KnownRef | null;
    readonly owner: KnownRef | null;
  },
): PlannedUnit {
  const ref = (known: KnownRef | null) => (known === null || 'problem' in known ? null : known.ref);
  return {
    row: found.row,
    code: found.code,
    name: recordNameSchema.parse(found.cells.name),
    kind,
    parent: ref(refs.parent),
    owner: ref(refs.owner),
  };
}

function checkArea(
  found: AreaRow,
  context: {
    readonly known: KnownStructure;
    readonly units: ReadonlySet<string>;
    readonly positions: ReadonlySet<string>;
  },
  problems: Problems,
): PlannedUnit | null {
  const { cells, row, code } = found;
  const before = problems.list.length;
  const kind = KINDS[normalizedHeader(cells.kind ?? '')];
  if (!recordNameSchema.safeParse(cells.name).success)
    problems.add(row, code, 'el nombre debe tener entre 2 y 120 letras');
  if (kind === undefined) problems.add(row, code, 'el tipo debe ser «Proceso» o «Área»');
  const parent =
    cells.parent === undefined ? null : unitRef(context.known, context.units, cells.parent);
  const owner =
    cells.owner === undefined ? null : positionRef(context.known, context.positions, cells.owner);
  for (const ref of [parent, owner])
    if (ref !== null && 'problem' in ref) problems.add(row, code, ref.problem);
  if (cells.parent === code) problems.add(row, code, 'un proceso no puede depender de sí mismo');
  if (problems.list.length > before || kind === undefined) return null;
  return areaOf(found, kind, { parent, owner });
}

interface PositionRow {
  readonly row: number;
  readonly name: string;
  readonly cells: Cells<PositionColumn>;
}

function checkPosition(
  found: PositionRow,
  context: {
    readonly known: KnownStructure;
    readonly units: ReadonlySet<string>;
    readonly positions: ReadonlySet<string>;
  },
  problems: Problems,
): PlannedPosition | null {
  const { row, name, cells } = found;
  const before = problems.list.length;
  if (!recordNameSchema.safeParse(name).success)
    problems.add(row, name, 'el cargo debe tener entre 2 y 120 letras');
  const unit = unitRef(context.known, context.units, cells.unit ?? '');
  const boss =
    cells.boss === undefined ? null : positionRef(context.known, context.positions, cells.boss);
  for (const ref of [unit, boss])
    if (ref !== null && 'problem' in ref) problems.add(row, name, ref.problem);
  if ('ref' in unit && !unit.active)
    problems.add(row, name, `el proceso o área ${cells.unit ?? ''} está inactivo`);
  if (boss !== null && nameKey(cells.boss ?? '') === nameKey(name))
    problems.add(row, name, 'un cargo no puede reportarse a sí mismo');
  if (problems.list.length > before || !('ref' in unit)) return null;
  return {
    row,
    name: name.trim(),
    unit: unit.ref,
    boss: boss !== null && 'ref' in boss ? boss.ref : null,
  };
}

function newAreaRows(
  parsed: readonly (readonly string[])[],
  known: KnownStructure,
  problems: Problems,
) {
  const sheet = readSheet(parsed, AREA_COLUMNS);
  problems.list.push(...sheet.problems);
  const rows: AreaRow[] = [];
  for (const { row, cells } of sheet.rows) {
    const code = (cells.code ?? '').toUpperCase();
    if (!businessCodeSchema.safeParse(code).success) {
      problems.add(
        row,
        cells.code ?? null,
        'el código debe tener mayúsculas, números y guiones (máximo 20)',
      );
    } else rows.push({ row, code, cells });
  }
  for (const repeated of repeatedKeys(rows, (item) => item.code)) {
    problems.add(repeated.row, repeated.code, 'el código está repetido en el archivo');
  }
  const unique = rows.filter(
    (item, index) => rows.findIndex((other) => other.code === item.code) === index,
  );
  return {
    fresh: unique.filter((item) => !known.units.has(item.code)),
    existing: unique.length - unique.filter((item) => !known.units.has(item.code)).length,
  };
}

function newPositionRows(
  parsed: readonly (readonly string[])[],
  known: KnownStructure,
  problems: Problems,
) {
  const sheet = readSheet(parsed, POSITION_COLUMNS);
  problems.list.push(...sheet.problems);
  const rows: PositionRow[] = sheet.rows.map(({ row, cells }) => ({
    row,
    name: cells.name ?? '',
    cells,
  }));
  for (const repeated of repeatedKeys(rows, (item) => nameKey(item.name))) {
    problems.add(repeated.row, repeated.name, 'el cargo está repetido en el archivo');
  }
  const existing = new Set(known.positions.map((position) => nameKey(position.name)));
  const unique = rows.filter(
    (item, index) =>
      rows.findIndex((other) => nameKey(other.name) === nameKey(item.name)) === index,
  );
  const fresh = unique.filter((item) => !existing.has(nameKey(item.name)));
  return { fresh, existing: unique.length - fresh.length };
}

function dependencyOf(ref: Ref | null): string | null {
  return ref?.kind === 'new' ? ref.key : null;
}

/** Revisa las dos plantillas contra lo que ya tiene la empresa y entrega lo que se va a crear. */
export function planStructure(
  files: {
    readonly areas: readonly (readonly string[])[];
    readonly positions: readonly (readonly string[])[];
  },
  known: KnownStructure,
): StructurePlan {
  const problems = new Problems();
  const areas = newAreaRows(files.areas, known, problems);
  const positions = newPositionRows(files.positions, known, problems);
  const context = {
    known,
    units: new Set(areas.fresh.map((item) => item.code)),
    positions: new Set(positions.fresh.map((item) => nameKey(item.name))),
  };
  const units = areas.fresh.flatMap((item) => checkArea(item, context, problems) ?? []);
  const people = positions.fresh.flatMap((item) => checkPosition(item, context, problems) ?? []);
  const unitOrder = inDependencyOrder(
    units.map((item) => ({ item, key: item.code, dependsOn: dependencyOf(item.parent) })),
  );
  const positionOrder = inDependencyOrder(
    people.map((item) => ({ item, key: nameKey(item.name), dependsOn: dependencyOf(item.boss) })),
  );
  for (const item of unitOrder.cyclic)
    problems.add(item.row, item.code, 'las dependencias forman un círculo');
  for (const item of positionOrder.cyclic)
    problems.add(item.row, item.name, 'a quién reporta forma un círculo');
  return {
    units: unitOrder.ordered,
    positions: positionOrder.ordered,
    existingUnits: areas.existing,
    existingPositions: positions.existing,
    problems: problems.list,
  };
}
