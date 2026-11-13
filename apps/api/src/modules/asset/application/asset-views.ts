import {
  assetCategorySchema,
  assetStatusSchema,
  assignmentStatusSchema,
  maintenanceKindSchema,
  retireReasonSchema,
  straightLineDepreciation,
  type Asset,
  type AssetAssignment,
  type AssetMaintenance,
} from '@arza/contracts';

import type {
  AstAsset,
  AstAssignment,
  AstMaintenance,
  Prisma,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';

// Cómo se ve un activo: con su asignación abierta, quién lo tiene y su depreciación informativa.

const OPEN_ASSIGNMENT = ['preparing', 'in_signature', 'active'];

type People = Awaited<ReturnType<typeof peopleById>>;

function personName(people: People, id: string): string {
  const person = people.get(id);
  return person?.displayName ?? person?.email ?? 'Persona';
}

function optionalDate(date: Date | null): string | null {
  return date === null ? null : toCalendarDate(date);
}

function assignmentView(row: AstAssignment, people: People): AssetAssignment {
  return {
    id: row.id,
    holder: { id: row.userId, name: personName(people, row.userId) },
    status: assignmentStatusSchema.parse(row.status),
    assigned_on: toCalendarDate(row.assignedOn),
    sign_by: toCalendarDate(row.signBy),
    record_code: row.recordCode,
    envelope_code: row.envelopeCode,
    contract_document_id: row.contractDocumentId,
    returned_on: optionalDate(row.returnedOn),
    return_note: row.returnNote,
    closed_reason: row.closedReason,
    version: row.version,
  };
}

function assetView(
  asset: AstAsset,
  open: AstAssignment | undefined,
  people: People,
  today: string,
): Asset {
  const cost = asset.cost.toFixed(2);
  const purchaseDate = toCalendarDate(asset.purchaseDate);
  const retiredOn = optionalDate(asset.retiredOn);
  const depreciation = straightLineDepreciation(
    { cost, purchaseDate, usefulLifeMonths: asset.usefulLifeMonths },
    retiredOn ?? today,
  );
  return {
    id: asset.id,
    code: asset.code,
    name: asset.name,
    category: assetCategorySchema.parse(asset.category),
    serial: asset.serial,
    purchase_date: purchaseDate,
    cost,
    useful_life_months: asset.usefulLifeMonths,
    status: assetStatusSchema.parse(asset.status),
    location: asset.location,
    assignment: open === undefined ? null : assignmentView(open, people),
    retired_on: retiredOn,
    retire_reason:
      asset.retireReason === null ? null : retireReasonSchema.parse(asset.retireReason),
    retire_note: asset.retireNote,
    accumulated_depreciation: depreciation.accumulated,
    book_value: depreciation.bookValue,
    version: asset.version,
  };
}

/** Los activos que cumplen el filtro, por código, cada uno con su asignación abierta. */
export async function assetViews(
  tx: TenantTransaction,
  today: string,
  where: Prisma.AstAssetWhereInput,
): Promise<Asset[]> {
  const assets = await tx.astAsset.findMany({
    where: { ...where, deletedAt: null },
    orderBy: { code: 'asc' },
    take: 2000,
  });
  const open = await tx.astAssignment.findMany({
    where: {
      assetId: { in: assets.map((asset) => asset.id) },
      status: { in: OPEN_ASSIGNMENT },
      deletedAt: null,
    },
  });
  const people = await peopleById(
    tx,
    open.map((row) => row.userId),
  );
  const byAsset = new Map(open.map((row) => [row.assetId, row]));
  return assets.map((asset) => assetView(asset, byAsset.get(asset.id), people, today));
}

/** Solo los activos que la persona tiene o está por recibir (permiso «solo lo propio»). */
export function heldBy(userId: string): Prisma.AstAssetWhereInput {
  return {
    assignments: { some: { userId, status: { in: OPEN_ASSIGNMENT }, deletedAt: null } },
  };
}

/** La historia de asignaciones de un activo, de la más reciente a la más antigua. */
export async function assignmentHistory(
  tx: TenantTransaction,
  assetId: string,
): Promise<AssetAssignment[]> {
  const rows = await tx.astAssignment.findMany({
    where: { assetId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const people = await peopleById(
    tx,
    rows.map((row) => row.userId),
  );
  return rows.map((row) => assignmentView(row, people));
}

type MaintenanceWithAsset = AstMaintenance & { readonly asset: AstAsset };

function maintenanceView(row: MaintenanceWithAsset): AssetMaintenance {
  return {
    id: row.id,
    asset: { id: row.asset.id, code: row.asset.code, name: row.asset.name },
    kind: maintenanceKindSchema.parse(row.kind),
    scheduled_on: toCalendarDate(row.scheduledOn),
    done_on: optionalDate(row.doneOn),
    cost: row.cost === null ? null : row.cost.toFixed(2),
    note: row.note,
    version: row.version,
  };
}

/** Mantenimientos, del programado más reciente al más antiguo. */
export async function maintenanceViews(
  tx: TenantTransaction,
  where: Prisma.AstMaintenanceWhereInput,
): Promise<AssetMaintenance[]> {
  const rows = await tx.astMaintenance.findMany({
    where: { ...where, deletedAt: null },
    include: { asset: true },
    orderBy: [{ scheduledOn: 'desc' }, { id: 'desc' }],
    take: 500,
  });
  return rows.map(maintenanceView);
}
