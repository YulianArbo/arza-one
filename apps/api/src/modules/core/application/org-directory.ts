import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Consultas del organigrama para otros módulos (B18): procesos y cargos por identificador. Los
// documentos los guardan por identificador y piden aquí su código y su nombre.

export interface OrgUnitRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kind: 'process' | 'area';
  readonly isActive: boolean;
}

export interface PositionSummary {
  readonly id: string;
  readonly name: string;
  readonly orgUnitId: string;
  readonly isActive: boolean;
}

/** Procesos y áreas que existen (también los inactivos), por identificador. */
export async function orgUnitsById(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, OrgUnitRecord>> {
  if (ids.length === 0) return new Map();
  const units = await tx.orgUnit.findMany({
    where: { id: { in: [...new Set(ids)] }, deletedAt: null },
    select: { id: true, code: true, name: true, kind: true, isActive: true },
  });
  return new Map(
    units.map((unit) => [unit.id, { ...unit, kind: unit.kind === 'area' ? 'area' : 'process' }]),
  );
}

/** Procesos activos del mapa de procesos, en orden de código. */
export async function activeProcesses(tx: TenantTransaction): Promise<OrgUnitRecord[]> {
  const units = await tx.orgUnit.findMany({
    where: { kind: 'process', isActive: true, deletedAt: null },
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: { code: 'asc' },
  });
  return units.map((unit) => ({ ...unit, kind: 'process' }));
}

/** Cargos que existen (también los inactivos), por identificador. */
export async function positionsById(
  tx: TenantTransaction,
  ids: readonly string[],
): Promise<Map<string, PositionSummary>> {
  if (ids.length === 0) return new Map();
  const positions = await tx.position.findMany({
    where: { id: { in: [...new Set(ids)] }, deletedAt: null },
    select: { id: true, name: true, orgUnitId: true, isActive: true },
  });
  return new Map(positions.map((position) => [position.id, position]));
}

/** Cargos activos de la empresa, en orden de nombre (B19: la carga inicial los busca por nombre). */
export async function activePositions(tx: TenantTransaction): Promise<PositionSummary[]> {
  return tx.position.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true, name: true, orgUnitId: true, isActive: true },
    orderBy: { name: 'asc' },
  });
}

/** Cargo dueño de un proceso, como el «Líder de Servicio al Cliente» de SAC; null si no tiene. */
export async function processOwnerPositionId(
  tx: TenantTransaction,
  processCode: string,
): Promise<string | null> {
  const unit = await tx.orgUnit.findFirst({
    where: { code: processCode, kind: 'process', isActive: true, deletedAt: null },
    select: { ownerPositionId: true },
  });
  return unit?.ownerPositionId ?? null;
}

/**
 * Procesos ligados a un cargo: el proceso (o los procesos superiores) donde está el cargo y los que
 * el cargo dirige. Calidad lo usa para que un auditor no audite su propio proceso (B39, decisión 2).
 */
export async function processesOfPosition(
  tx: TenantTransaction,
  positionId: string,
): Promise<string[]> {
  const position = await tx.position.findFirst({
    where: { id: positionId, deletedAt: null },
    select: { orgUnitId: true },
  });
  const owned = await tx.orgUnit.findMany({
    where: { ownerPositionId: positionId, kind: 'process', deletedAt: null },
    select: { id: true },
  });
  const found = new Set(owned.map((unit) => unit.id));
  let unitId: string | null = position?.orgUnitId ?? null;
  for (let hops = 0; unitId !== null && hops < 10; hops += 1) {
    const unit = await tx.orgUnit.findFirst({
      where: { id: unitId, deletedAt: null },
      select: { id: true, kind: true, parentId: true },
    });
    if (unit?.kind === 'process') found.add(unit.id);
    unitId = unit?.parentId ?? null;
  }
  return [...found];
}
