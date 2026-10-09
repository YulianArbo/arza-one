import { Injectable } from '@nestjs/common';

import type { Session } from '../../../generated/prisma/client.js';
import { recordAuditEvent, recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { LOCK_DURATION_MS } from '../domain/login-throttle.js';
import { VERIFICATION_FAILURES_TO_LOCK } from '../domain/second-factor-policy.js';
import { revokeSession } from '../infrastructure/accounts-store.js';

export interface VerificationFailure {
  readonly session: Session;
  /** Acción que falló, para la auditoría: «iam.mfa.verify», «iam.session.reauthenticate»… */
  readonly action: string;
  readonly meta: RequestMeta;
  readonly now: Date;
}

/**
 * Códigos equivocados (B09): igual que con la contraseña, el quinto fallo seguido en una sesión
 * la cierra, bloquea la cuenta 15 minutos, registra un evento de seguridad y deja la alerta en la
 * bandeja de salida (B16 la entrega). El conteo se guarda aunque la petición termine en error.
 */
@Injectable()
export class VerificationFailures {
  /** Registra el fallo. Devuelve true si con él se bloqueó la cuenta. */
  async register(tx: TenantTransaction, failure: VerificationFailure): Promise<boolean> {
    const { session, action, meta, now } = failure;
    const updated = await tx.session.update({
      where: { id: session.id },
      data: { mfaFailures: { increment: 1 } },
    });
    await recordAuditEvent(tx, {
      tenantId: session.tenantId,
      occurredAt: now,
      actor: { kind: 'user', id: session.userId },
      action,
      entityType: 'iam_session',
      entityId: session.id,
      result: 'failure',
      changes: { failures: updated.mfaFailures },
      meta,
    });
    if (updated.mfaFailures < VERIFICATION_FAILURES_TO_LOCK) return false;
    await this.lock(tx, session, meta, now);
    return true;
  }

  private async lock(
    tx: TenantTransaction,
    session: Session,
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    const { tenantId, userId } = session;
    const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS).toISOString();
    await revokeSession(tx, session.id, 'mfa_failures', now);
    await tx.user.update({ where: { id: userId }, data: { lockedUntil } });
    await this.recordLock(tx, session, lockedUntil, meta, now);
    await addOutboxEvent(tx, {
      tenantId,
      eventType: 'security.alert',
      actorId: null,
      occurredAt: now,
      payload: { type: 'iam.mfa.failures', user_id: userId },
    });
  }

  private async recordLock(
    tx: TenantTransaction,
    session: Session,
    lockedUntil: string,
    meta: RequestMeta,
    now: Date,
  ): Promise<void> {
    const { tenantId, userId } = session;
    await recordSecurityEvent(tx, {
      tenantId,
      occurredAt: now,
      type: 'iam.mfa.failures',
      userId,
      severity: 'high',
      detail: {
        failures: VERIFICATION_FAILURES_TO_LOCK,
        session_id: session.id,
        locked_until: lockedUntil,
      },
      meta,
    });
    await recordAuditEvent(tx, {
      tenantId,
      occurredAt: now,
      actor: { kind: 'system' },
      action: 'iam.user.lock',
      entityType: 'iam_user',
      entityId: userId,
      result: 'success',
      changes: { locked_until: lockedUntil, reason: 'second_factor_failures' },
      meta,
    });
  }
}
