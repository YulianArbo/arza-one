import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOrgUnit, addPosition, setUnitOwner, type CoreActor } from '../../core/index.js';
import { nameKey, type Ref } from '../domain/known.js';
import type { SheetProblem } from '../domain/sheet.js';
import type { PlannedPosition, PlannedUnit, StructurePlan } from '../domain/structure-plan.js';
import type { LoadDependencies, LoadRequest } from './load-context.js';

// Alta de los procesos, áreas y cargos nuevos de la carga inicial (B45), en el orden del plan: cada
// proceso después del que lo contiene y cada cargo después de su jefe. Un alta que falla se informa
// y lo que depende de ella también queda sin crear, porque no tiene a quién apuntar.

export interface StructureResult {
  readonly created: number;
  /** Ids de los cargos nuevos por nombre en minúsculas, para los usuarios de la misma carga. */
  readonly positionIds: ReadonlyMap<string, string>;
  readonly problems: SheetProblem[];
}

class Step {
  readonly unitIds = new Map<string, string>();
  readonly positionIds = new Map<string, string>();
  readonly problems: SheetProblem[] = [];
  created = 0;

  constructor(
    private readonly deps: LoadDependencies,
    private readonly request: LoadRequest,
  ) {}

  /** Corre el alta en su transacción; si falla, guarda el problema y devuelve null. */
  async write<T>(
    target: { readonly row: number; readonly key: string; readonly counts: boolean },
    work: (actor: CoreActor, tx: TenantTransaction) => Promise<T>,
  ): Promise<T | null> {
    const context = { tenantId: this.request.tenantId, userId: this.request.userId };
    try {
      const result = await this.deps.database.withTenant(context, (tx) =>
        work({ context, meta: null, at: this.deps.clock.now() }, tx),
      );
      if (target.counts) this.created += 1;
      return result;
    } catch (error) {
      const problem = error instanceof Error ? error.message : 'no se pudo crear';
      this.problems.push({ row: target.row, key: target.key, problem });
      return null;
    }
  }

  idOf(ref: Ref | null, ids: ReadonlyMap<string, string>): string | null | undefined {
    if (ref === null) return null;
    return ref.kind === 'existing' ? ref.id : ids.get(ref.key);
  }
}

async function addUnit(step: Step, unit: PlannedUnit): Promise<void> {
  const parentId = step.idOf(unit.parent, step.unitIds);
  if (parentId === undefined) {
    step.problems.push({
      row: unit.row,
      key: unit.code,
      problem: 'no se creó el proceso del que depende',
    });
    return;
  }
  const id = await step.write({ row: unit.row, key: unit.code, counts: true }, (actor, tx) =>
    addOrgUnit(tx, actor, { code: unit.code, name: unit.name, kind: unit.kind, parentId }),
  );
  if (id !== null) step.unitIds.set(unit.code, id);
}

async function addOne(step: Step, position: PlannedPosition): Promise<void> {
  const orgUnitId = step.idOf(position.unit, step.unitIds);
  const reportsToId = step.idOf(position.boss, step.positionIds);
  if (orgUnitId === undefined || orgUnitId === null || reportsToId === undefined) {
    step.problems.push({
      row: position.row,
      key: position.name,
      problem: 'no se creó su proceso o su jefe',
    });
    return;
  }
  const target = { row: position.row, key: position.name, counts: true };
  const id = await step.write(target, (actor, tx) =>
    addPosition(tx, actor, { name: position.name, orgUnitId, reportsToId }),
  );
  if (id !== null) step.positionIds.set(nameKey(position.name), id);
}

async function setOwner(step: Step, unit: PlannedUnit): Promise<void> {
  const unitId = step.unitIds.get(unit.code);
  const positionId = step.idOf(unit.owner, step.positionIds);
  if (unitId === undefined || positionId === null) return;
  if (positionId === undefined) {
    step.problems.push({ row: unit.row, key: unit.code, problem: 'no se creó su cargo líder' });
    return;
  }
  await step.write({ row: unit.row, key: unit.code, counts: false }, (actor, tx) =>
    setUnitOwner(tx, actor, { unitId, positionId }),
  );
}

export async function applyStructure(
  deps: LoadDependencies,
  request: LoadRequest,
  plan: StructurePlan,
): Promise<StructureResult> {
  const step = new Step(deps, request);
  for (const unit of plan.units) await addUnit(step, unit);
  for (const position of plan.positions) await addOne(step, position);
  for (const unit of plan.units) await setOwner(step, unit);
  return { created: step.created, positionIds: step.positionIds, problems: step.problems };
}
