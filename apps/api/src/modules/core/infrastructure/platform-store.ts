import type { PlanLimits, TenantPlan } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Funciones de la plataforma en la base de datos (migración de B48). Todas exigen que la
// transacción corra en el contexto de la empresa operadora; si no, la base de datos responde
// TENANCY_OPERATOR_ONLY aunque el código se equivoque.

/** Ficha de una empresa: nunca su contenido (decisión 2). */
export interface TenantRecord {
  readonly id: string;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string;
  readonly status: 'active' | 'suspended' | 'closed';
  readonly plan: TenantPlan;
  readonly limits: PlanLimits;
  readonly suspendedAt: Date | null;
  readonly suspensionReason: string | null;
  readonly deletionRequestedAt: Date | null;
  readonly deletionDueOn: Date | null;
  readonly deletionReason: string | null;
  readonly deletionExportId: string | null;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
  readonly version: number;
}

interface TenantRow {
  readonly id: string;
  readonly legal_name: string;
  readonly trade_name: string | null;
  readonly tax_id: string;
  readonly status: TenantRecord['status'];
  readonly plan: TenantPlan;
  readonly limit_internal_users: number | null;
  readonly limit_portal_users: number | null;
  readonly limit_storage_mb: number;
  readonly limit_ai_assistant: boolean;
  readonly suspended_at: Date | null;
  readonly suspension_reason: string | null;
  readonly deletion_requested_at: Date | null;
  readonly deletion_due_on: Date | null;
  readonly deletion_reason: string | null;
  readonly deletion_export_id: string | null;
  readonly closed_at: Date | null;
  readonly created_at: Date;
  readonly version: number;
}

function recordOf(row: TenantRow): TenantRecord {
  return {
    id: row.id,
    legalName: row.legal_name,
    tradeName: row.trade_name,
    taxId: row.tax_id,
    status: row.status,
    plan: row.plan,
    limits: {
      maxInternalUsers: row.limit_internal_users,
      maxPortalUsers: row.limit_portal_users,
      storageMb: row.limit_storage_mb,
      aiAssistant: row.limit_ai_assistant,
    },
    suspendedAt: row.suspended_at,
    suspensionReason: row.suspension_reason,
    deletionRequestedAt: row.deletion_requested_at,
    deletionDueOn: row.deletion_due_on,
    deletionReason: row.deletion_reason,
    deletionExportId: row.deletion_export_id,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    version: row.version,
  };
}

/** Todas las empresas de la plataforma. */
export async function platformTenants(tx: TenantTransaction): Promise<TenantRecord[]> {
  const rows = await tx.$queryRaw<TenantRow[]>`SELECT * FROM core_platform_tenants()`;
  return rows.map(recordOf);
}

export interface LastExport {
  readonly id: string;
  readonly readyAt: Date;
}

/** La última exportación lista de cada empresa: solo su identificador y su fecha. */
export async function lastExports(tx: TenantTransaction): Promise<Map<string, LastExport>> {
  const rows = await tx.$queryRaw<{ tenant_id: string; export_id: string; ready_at: Date }[]>`
    SELECT tenant_id, export_id, ready_at FROM core_platform_last_exports()`;
  return new Map(rows.map((row) => [row.tenant_id, { id: row.export_id, readyAt: row.ready_at }]));
}

export interface NewTenant {
  readonly id: string;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string;
  readonly plan: TenantPlan;
  readonly limits: PlanLimits;
}

export async function registerTenant(tx: TenantTransaction, tenant: NewTenant): Promise<void> {
  const { limits } = tenant;
  await tx.$executeRaw`
    SELECT core_platform_register_tenant(
      ${tenant.id}::uuid, ${tenant.legalName}, ${tenant.tradeName}, ${tenant.taxId}, ${tenant.plan},
      ${limits.maxInternalUsers}::integer, ${limits.maxPortalUsers}::integer,
      ${limits.storageMb}::integer, ${limits.aiAssistant}::boolean)`;
}

/** Cambia el plan y sus límites. false si la versión ya no coincide. */
export async function setTenantPlan(
  tx: TenantTransaction,
  change: { readonly id: string; readonly version: number; readonly plan: TenantPlan },
  limits: PlanLimits,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ changed: number }[]>`
    SELECT core_platform_set_plan(
      ${change.id}::uuid, ${change.version}::integer, ${change.plan},
      ${limits.maxInternalUsers}::integer, ${limits.maxPortalUsers}::integer,
      ${limits.storageMb}::integer, ${limits.aiAssistant}::boolean) AS changed`;
  return rows.some((row) => row.changed > 0);
}

export type StatusAction = 'suspend' | 'reactivate' | 'request_deletion' | 'cancel_deletion';

export interface StatusChange {
  readonly id: string;
  readonly version: number;
  readonly action: StatusAction;
  readonly reason: string | null;
  /** Fecha del borrado, solo al pedir la eliminación (AAAA-MM-DD). */
  readonly dueOn: string | null;
  readonly exportId: string | null;
}

/** Cambia el estado. false si la versión ya no coincide; un estado inválido es un error. */
export async function changeTenantStatus(
  tx: TenantTransaction,
  change: StatusChange,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ changed: number }[]>`
    SELECT core_platform_change_status(
      ${change.id}::uuid, ${change.version}::integer, ${change.action}, ${change.reason},
      ${change.dueOn}::date, ${change.exportId}::uuid) AS changed`;
  return rows.some((row) => row.changed > 0);
}

/** Empresas cuya eliminación venció, o cerradas con archivos por borrar. Sin contexto. */
export async function tenantsDueForPurge(tx: TenantTransaction, today: string): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT core_tenants_due_for_purge(${today}::date) AS id`;
  return rows.map((row) => row.id);
}

/** Borra los datos de la empresa; devuelve las filas borradas por tabla. */
export async function purgeTenantData(
  tx: TenantTransaction,
  tenantId: string,
  today: string,
): Promise<Record<string, number>> {
  const rows = await tx.$queryRaw<{ counts: Record<string, number> }[]>`
    SELECT core_purge_tenant(${tenantId}::uuid, ${today}::date) AS counts`;
  return Object.assign({}, ...rows.map((row) => row.counts)) as Record<string, number>;
}

export async function markFilesPurged(tx: TenantTransaction, tenantId: string): Promise<void> {
  await tx.$executeRaw`SELECT core_mark_files_purged(${tenantId}::uuid)`;
}
