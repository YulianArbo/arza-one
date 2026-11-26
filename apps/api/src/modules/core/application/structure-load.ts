import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { auditCore, type CoreActor } from './core-audit.js';

// Lo que la carga inicial (B45, módulo de puesta en marcha) escribe en la estructura de la
// empresa: procesos o áreas y cargos que aún no existen. La semilla ya trae el organigrama
// DC-SGC-001; la carga solo agrega lo que falte. Cada alta deja el mismo evento de auditoría que la
// pantalla de Administración, con «source: import».

export interface StructureRef {
  readonly id: string;
  readonly isActive: boolean;
}

export interface StructureSnapshot {
  /** Procesos y áreas por código; null si se eliminó, porque un código no se recicla. */
  readonly units: ReadonlyMap<string, StructureRef | null>;
  /** Cargos vigentes, con su nombre. */
  readonly positions: readonly (StructureRef & { readonly name: string })[];
}

export interface NewOrgUnit {
  readonly code: string;
  readonly name: string;
  readonly kind: 'area' | 'process';
  readonly parentId: string | null;
}

export interface NewPosition {
  readonly name: string;
  readonly orgUnitId: string;
  readonly reportsToId: string | null;
}

const SOURCE = 'import';

export async function structureSnapshot(tx: TenantTransaction): Promise<StructureSnapshot> {
  const units = await tx.orgUnit.findMany({
    select: { id: true, code: true, isActive: true, deletedAt: true },
  });
  const positions = await tx.position.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, isActive: true },
  });
  return {
    units: new Map(
      units.map((unit) => [unit.code, unit.deletedAt === null ? unit : null] as const),
    ),
    positions,
  };
}

export async function addOrgUnit(
  tx: TenantTransaction,
  actor: CoreActor,
  unit: NewOrgUnit,
): Promise<string> {
  const created = await tx.orgUnit.create({
    data: {
      tenantId: actor.context.tenantId,
      parentId: unit.parentId,
      code: unit.code,
      name: unit.name,
      kind: unit.kind,
    },
  });
  await auditCore(tx, actor, {
    action: 'core.org_unit.create',
    entityType: 'org_unit',
    entityId: created.id,
    changes: {
      code: unit.code,
      name: unit.name,
      kind: unit.kind,
      parent_id: unit.parentId,
      source: SOURCE,
    },
  });
  return created.id;
}

export async function addPosition(
  tx: TenantTransaction,
  actor: CoreActor,
  position: NewPosition,
): Promise<string> {
  const created = await tx.position.create({
    data: {
      tenantId: actor.context.tenantId,
      orgUnitId: position.orgUnitId,
      name: position.name,
      reportsToId: position.reportsToId,
    },
  });
  await auditCore(tx, actor, {
    action: 'core.position.create',
    entityType: 'position',
    entityId: created.id,
    changes: {
      name: position.name,
      org_unit_id: position.orgUnitId,
      reports_to_id: position.reportsToId,
      source: SOURCE,
    },
  });
  return created.id;
}

/** El cargo que lidera un proceso o área recién cargado. */
export async function setUnitOwner(
  tx: TenantTransaction,
  actor: CoreActor,
  owner: { readonly unitId: string; readonly positionId: string },
): Promise<void> {
  await tx.orgUnit.update({
    where: { id: owner.unitId },
    data: { ownerPositionId: owner.positionId },
  });
  await auditCore(tx, actor, {
    action: 'core.org_unit.update',
    entityType: 'org_unit',
    entityId: owner.unitId,
    changes: { owner_position_id: { from: null, to: owner.positionId }, source: SOURCE },
  });
}

/** La empresa está registrada (con RLS, solo se ve a sí misma). Para la revisión de B45. */
export async function tenantRegistered(tx: TenantTransaction, tenantId: string): Promise<boolean> {
  return (await tx.tenant.count({ where: { id: tenantId } })) > 0;
}
