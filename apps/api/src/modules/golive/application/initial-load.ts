import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addCompany } from '../../party/index.js';
import { nameKey, type Ref } from '../domain/known.js';
import {
  planCompanies,
  planUsers,
  type Plan,
  type PlannedCompany,
  type PlannedUser,
} from '../domain/people-plan.js';
import type { SheetProblem } from '../domain/sheet.js';
import { planStructure, type StructurePlan } from '../domain/structure-plan.js';
import {
  knownOf,
  missingPermissions,
  parsedFiles,
  type Known,
  type LoadDependencies,
  type LoadRequest,
} from './load-context.js';
import { applyStructure } from './structure-apply.js';

// Carga inicial de la puesta en marcha (B45, numeral 18.2 y anexo E punto 17): estructura (áreas y
// cargos), usuarios internos y terceros empresa. Sin «aplicar» solo revisa y entrega el informe.
// Al aplicar, primero se revisa todo: con un solo problema no se carga nada. Cada alta va en su
// propia transacción con su auditoría; se puede repetir: lo que ya existe se informa y no se toca.

type SheetName = 'estructura' | 'usuarios' | 'terceros';

export interface SheetReport {
  readonly sheet: SheetName;
  /** Filas nuevas listas para crear (o creadas, si se aplicó). */
  readonly planned: number;
  readonly created: number;
  readonly existing: number;
  readonly problems: readonly SheetProblem[];
}

export interface LoadReport {
  readonly applied: boolean;
  /** Permisos que le faltan a quien carga; si falta alguno, no se revisa ni se carga nada. */
  readonly missingPermissions: readonly string[];
  readonly sheets: readonly SheetReport[];
}

interface Plans {
  readonly structure: StructurePlan;
  readonly users: Plan<PlannedUser>;
  readonly companies: Plan<PlannedCompany>;
}

function plansOf(request: LoadRequest, known: Known): Plans {
  const files = parsedFiles(request.files);
  const structure = planStructure(
    { areas: files.areas, positions: files.positions },
    known.structure,
  );
  const users = planUsers(files.users, {
    known: known.structure,
    newPositions: new Set(structure.positions.map((position) => nameKey(position.name))),
    roles: new Set(known.roles.keys()),
    accounts: known.accounts,
  });
  return { structure, users, companies: planCompanies(files.companies, known.nits) };
}

function reportOf(
  plans: Plans,
  created: Readonly<Record<SheetName, number>>,
  extra: readonly SheetProblem[][],
) {
  const { structure, users, companies } = plans;
  const sheets: SheetReport[] = [
    {
      sheet: 'estructura',
      planned: structure.units.length + structure.positions.length,
      created: created.estructura,
      existing: structure.existingUnits + structure.existingPositions,
      problems: [...structure.problems, ...(extra[0] ?? [])],
    },
    {
      sheet: 'usuarios',
      planned: users.items.length,
      created: created.usuarios,
      existing: users.existing,
      problems: [...users.problems, ...(extra[1] ?? [])],
    },
    {
      sheet: 'terceros',
      planned: companies.items.length,
      created: created.terceros,
      existing: companies.existing,
      problems: [...companies.problems, ...(extra[2] ?? [])],
    },
  ];
  return sheets;
}

function problemOf(row: number, key: string, error: unknown): SheetProblem {
  return { row, key, problem: error instanceof Error ? error.message : 'no se pudo crear' };
}

function resolved(ref: Ref | null, ids: ReadonlyMap<string, string>): string | null {
  if (ref === null) return null;
  return ref.kind === 'existing' ? ref.id : (ids.get(ref.key) ?? null);
}

async function applyUsers(
  deps: LoadDependencies,
  request: LoadRequest,
  context: {
    readonly plan: Plan<PlannedUser>;
    readonly known: Known;
    readonly positionIds: ReadonlyMap<string, string>;
  },
): Promise<{ created: number; problems: SheetProblem[] }> {
  const problems: SheetProblem[] = [];
  let created = 0;
  for (const user of context.plan.items) {
    const roleIds = user.roleCodes.flatMap((code) => {
      const role = context.known.roles.get(code);
      return role === undefined ? [] : [role.id];
    });
    try {
      await deps.invitations.invite({
        tenantId: request.tenantId,
        email: user.email,
        kind: 'internal',
        displayName: user.displayName,
        actorId: request.userId,
        roleIds,
        positionId: resolved(user.position, context.positionIds),
      });
      created += 1;
    } catch (error) {
      problems.push(problemOf(user.row, user.email, error));
    }
  }
  return { created, problems };
}

async function applyCompanies(
  deps: LoadDependencies,
  request: LoadRequest,
  plan: Plan<PlannedCompany>,
) {
  const problems: SheetProblem[] = [];
  let created = 0;
  const actor = { tenantId: request.tenantId, userId: request.userId };
  for (const company of plan.items) {
    try {
      await deps.database.withTenant(actor, (tx: TenantTransaction) =>
        addCompany(tx, { ...actor, at: deps.clock.now() }, company.input),
      );
      created += 1;
    } catch (error) {
      problems.push(problemOf(company.row, company.nit, error));
    }
  }
  return { created, problems };
}

function hasProblems(plans: Plans): boolean {
  return [plans.structure.problems, plans.users.problems, plans.companies.problems].some(
    (list) => list.length > 0,
  );
}

/** Revisa (y, si se pide y no hay problemas, aplica) la carga inicial. */
export async function runInitialLoad(
  deps: LoadDependencies,
  request: LoadRequest,
): Promise<LoadReport> {
  const context = { tenantId: request.tenantId, userId: request.userId };
  const { missing, known } = await deps.database.withTenant(context, async (tx) => ({
    missing: await missingPermissions(tx, request, deps.clock.now()),
    known: await knownOf(tx, parsedFiles(request.files)),
  }));
  if (missing.length > 0) return { applied: false, missingPermissions: missing, sheets: [] };
  const plans = plansOf(request, known);
  const none = { estructura: 0, usuarios: 0, terceros: 0 };
  if (!request.apply || hasProblems(plans)) {
    return { applied: false, missingPermissions: [], sheets: reportOf(plans, none, []) };
  }
  const structure = await applyStructure(deps, request, plans.structure);
  const users = await applyUsers(deps, request, {
    plan: plans.users,
    known,
    positionIds: structure.positionIds,
  });
  const companies = await applyCompanies(deps, request, plans.companies);
  const created = {
    estructura: structure.created,
    usuarios: users.created,
    terceros: companies.created,
  };
  return {
    applied: true,
    missingPermissions: [],
    sheets: reportOf(plans, created, [structure.problems, users.problems, companies.problems]),
  };
}
