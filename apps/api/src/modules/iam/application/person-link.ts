import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// La persona de Terceros que es un colaborador (B25): de ahí salen su nombre y su documento cuando
// firma por la empresa (numeral 19.4). Mientras llega la vinculación de colaboradores de Talento
// humano (M12), la hace el responsable técnico con `pnpm contratos:vincular-firmante`.

export interface PersonLink {
  readonly tenantId: string;
  readonly userId: string;
  readonly partyId: string;
  readonly at: Date;
}

/** Vincula la cuenta interna con su persona; false si la cuenta no es de un colaborador activo. */
export async function linkUserToPerson(tx: TenantTransaction, link: PersonLink): Promise<boolean> {
  const user = await tx.user.findFirst({
    where: { id: link.userId, kind: 'internal', deletedAt: null },
    select: { partyId: true },
  });
  if (user === null) return false;
  await tx.user.update({ where: { id: link.userId }, data: { partyId: link.partyId } });
  await recordAuditEvent(tx, {
    tenantId: link.tenantId,
    occurredAt: link.at,
    actor: { kind: 'system' },
    action: 'iam.user.person_link',
    entityType: 'iam_user',
    entityId: link.userId,
    result: 'success',
    changes: { party_id: [user.partyId, link.partyId] },
    meta: null,
  });
  return true;
}
