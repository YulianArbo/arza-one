import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Intentos de verificar la identidad con el segundo factor (B09), contados desde la auditoría de
// la persona y no por sesión: abrir otra sesión con la contraseña no reinicia la cuenta.

/** Acciones que registran un código o una contraseña equivocados. */
const FAILURE_ACTIONS = ['iam.mfa.verify', 'iam.session.reauthenticate', 'iam.mfa.setup_confirm'];
/** Acciones que prueban que la persona tiene su segundo factor: reinician la cuenta. */
const SUCCESS_ACTIONS = [
  'iam.mfa.verify',
  'iam.session.reauthenticate',
  'iam.mfa.enable',
  'iam.mfa.change',
];

/** Fallos de la persona desde `since` y desde su último acierto. */
export async function recentVerificationFailures(
  tx: TenantTransaction,
  userId: string,
  since: Date,
): Promise<number> {
  const lastSuccess = await tx.auditEvent.findFirst({
    where: { actorId: userId, action: { in: SUCCESS_ACTIONS }, result: 'success' },
    orderBy: { occurredAt: 'desc' },
    select: { occurredAt: true },
  });
  const from =
    lastSuccess !== null && lastSuccess.occurredAt > since ? lastSuccess.occurredAt : since;
  return tx.auditEvent.count({
    where: {
      actorId: userId,
      action: { in: FAILURE_ACTIONS },
      result: 'failure',
      occurredAt: { gte: from },
    },
  });
}
