import { leadStatusSchema, type LeadStatus } from '@arza/contracts';

import type { CrmLead, Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { crmNotFound, statusInvalid } from './crm-messages.js';

// Lectura y cambio de un prospecto con su versión (B22), comunes a los casos de uso.

export const LEAD_SEQUENCE = 'crm.lead';
export const LEADS = { name: 'Prospectos del CRM', prefix: 'LEA', padding: 4 } as const;

export async function findLead(tx: TenantTransaction, id: string): Promise<CrmLead> {
  const lead = await tx.crmLead.findFirst({ where: { id, deletedAt: null } });
  if (lead === null) throw crmNotFound('El prospecto');
  return lead;
}

export function statusOf(lead: CrmLead): LeadStatus {
  return leadStatusSchema.parse(lead.status);
}

/** El prospecto está en uno de los estados esperados; si no, 409 con el porqué. */
export function assertLeadStatus(lead: CrmLead, allowed: readonly LeadStatus[]): void {
  if (allowed.includes(statusOf(lead))) return;
  const closed = lead.status === 'converted' || lead.status === 'discarded';
  throw statusInvalid(
    closed
      ? 'El prospecto ya está cerrado: convertido o descartado no cambia.'
      : 'Ese cambio no está permitido en el estado actual del prospecto.',
  );
}

/** Cambia el prospecto solo si nadie lo cambió desde que se vio (If-Match). */
export async function updateLeadVersioned(
  tx: TenantTransaction,
  target: { readonly id: string; readonly version: number },
  data: Prisma.CrmLeadUncheckedUpdateManyInput,
): Promise<void> {
  const { count } = await tx.crmLead.updateMany({
    where: { id: target.id, version: target.version, deletedAt: null },
    data,
  });
  if (count === 0) throw versionConflict();
}

/** Lo que guarda la auditoría del prospecto: sin datos personales, que viven en Terceros. */
type AuditValues = Record<string, string | number | null>;

export function leadAudit(lead: CrmLead): AuditValues {
  return {
    code: lead.code,
    status: lead.status,
    source: lead.source,
    campaign_id: lead.campaignId,
    owner_id: lead.ownerId,
    company_name: lead.companyName,
  };
}
