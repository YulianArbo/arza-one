import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { PortalAdminActor } from './portal-accounts.js';

// Términos del portal que cada persona aceptó (B30, decisión 8) y lo que se entrega en la copia de
// sus datos (Ley 1581, art. 8). La aceptación solo se agrega: es la evidencia de qué versión leyó.

export interface AcceptedTerms {
  readonly noticeId: string;
  readonly noticeKey: string;
  readonly versionNumber: number;
  readonly acceptedAt: Date;
}

export async function acceptedTermsOf(
  tx: TenantTransaction,
  userId: string,
): Promise<AcceptedTerms[]> {
  const rows = await tx.termsAcceptance.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ acceptedAt: 'desc' }, { id: 'asc' }],
  });
  return rows.map((row) => ({
    noticeId: row.noticeId,
    noticeKey: row.noticeKey,
    versionNumber: row.versionNumber,
    acceptedAt: row.acceptedAt,
  }));
}

export interface TermsVersion {
  readonly id: string;
  readonly key: 'portal_terms' | 'privacy_policy';
  readonly versionNumber: number;
}

/** Guarda la aceptación de cada versión que todavía no había aceptado, con su evidencia. */
export async function recordTermsAcceptance(
  tx: TenantTransaction,
  actor: PortalAdminActor,
  versions: readonly TermsVersion[],
): Promise<void> {
  const already = new Set((await acceptedTermsOf(tx, actor.userId)).map((row) => row.noticeId));
  const fresh = versions.filter((version) => !already.has(version.id));
  for (const version of fresh) {
    await tx.termsAcceptance.create({
      data: {
        tenantId: actor.tenantId,
        userId: actor.userId,
        noticeId: version.id,
        noticeKey: version.key,
        versionNumber: version.versionNumber,
        acceptedAt: actor.at,
        ipAddress: actor.meta.ip,
        userAgent: actor.meta.userAgent,
      },
    });
  }
  await recordAuditEvent(tx, {
    tenantId: actor.tenantId,
    occurredAt: actor.at,
    actor: { kind: 'user', id: actor.userId },
    action: 'iam.portal_terms.accept',
    entityType: 'iam_user',
    entityId: actor.userId,
    result: 'success',
    changes: {
      versions: fresh.map((version) => `${version.key}@${String(version.versionNumber)}`),
    },
    meta: actor.meta,
  });
}

export interface SessionTrace {
  readonly startedAt: Date;
  readonly ip: string | null;
  readonly device: string | null;
}

/** Las últimas sesiones de la persona, para su copia de datos: sin llaves ni huellas. */
export async function recentSessionsOf(
  tx: TenantTransaction,
  userId: string,
): Promise<SessionTrace[]> {
  const sessions = await tx.session.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 50,
  });
  return sessions.map((session) => ({
    startedAt: session.createdAt,
    ip: session.ip,
    device: session.userAgent,
  }));
}
