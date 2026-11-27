import { limitsView, type PlatformTenant } from '@arza/contracts';

import { toCalendarDate, type LastExport, type TenantRecord } from '../../core/index.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { isOperatorTenant } from '../../../platform/database/operator-tenant.js';
import { operatorOnly } from './tenancy-messages.js';

// Ficha de cada empresa para el operador de la plataforma (B48, decisión 2): datos legales, plan,
// uso y estado. Nunca su contenido.

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * El NIT ya existe: la función de la plataforma lo inserta con SQL, y la base de datos lo dice con
 * el nombre de su índice único.
 */
export function isTaxIdTaken(error: unknown): boolean {
  return error instanceof Error && error.message.includes('core_tenants_tax_id_key');
}

export interface Usage {
  readonly internal_users: number;
  readonly portal_users: number;
  readonly storage_mb: number;
}

export function cardOf(
  record: TenantRecord,
  usage: Usage | null,
  lastExport: LastExport | null,
): PlatformTenant {
  return {
    id: record.id,
    legal_name: record.legalName,
    trade_name: record.tradeName,
    tax_id: record.taxId,
    status: record.status,
    is_operator: isOperatorTenant(record.id),
    plan: record.plan,
    limits: limitsView(record.limits),
    usage,
    suspended_at: record.suspendedAt?.toISOString() ?? null,
    suspension_reason: record.suspensionReason,
    deletion_due_on: record.deletionDueOn === null ? null : toCalendarDate(record.deletionDueOn),
    closed_at: record.closedAt?.toISOString() ?? null,
    last_export_at: lastExport?.readyAt.toISOString() ?? null,
    created_at: record.createdAt.toISOString(),
    version: record.version,
  };
}

export const NO_OVERRIDES = {
  maxInternalUsers: null,
  maxPortalUsers: null,
  storageMb: null,
  aiAssistant: null,
} as const;

export function assertOperator(principal: Principal): void {
  if (!isOperatorTenant(principal.tenantId)) throw operatorOnly();
}
