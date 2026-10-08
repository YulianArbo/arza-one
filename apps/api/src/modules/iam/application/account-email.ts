import type { AccountEmailJob } from '../../../platform/queues/jobs.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { linkExpiresAt, type LinkPurpose } from '../domain/link-policy.js';
import { canSignIn } from '../domain/user.js';
import type { User } from '../../../generated/prisma/client.js';
import { expirePendingLinks, loadUser } from '../infrastructure/accounts-store.js';
import { newSecretToken } from '../infrastructure/secret-token.js';

// Correos de la cuenta (B08). Los arma el worker al procesar el trabajo: el enlace se crea en ese
// momento y su llave solo existe dentro del correo; la base de datos guarda su huella. Si el envío
// falla y el trabajo se reintenta, se crea un enlace nuevo y el anterior vence.

export interface AccountEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface AccountEmailDependencies {
  readonly database: Pick<DatabaseService, 'withTenant'>;
  readonly clock: Clock;
  /** Dirección de la aplicación interna (APP_URL); los enlaces van a su mismo dominio. */
  readonly appUrl: string;
}

const LINK_PAGES: Readonly<Record<LinkPurpose, string>> = {
  invitation: '/activar-cuenta',
  password_reset: '/restablecer-contrasena',
};

const BOGOTA_DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const SIGNATURE = 'ARZA ONE · ARZA TECH S.A.S.\nEste es un correo automático; no lo responda.';

function greeting(user: User): string {
  return user.displayName === null ? 'Hola:' : `Hola, ${user.displayName}:`;
}

/**
 * La llave va después de «#»: los navegadores no envían esa parte al servidor, así que no queda
 * en los registros de la web ni en la cabecera Referer.
 */
function linkUrl(appUrl: string, purpose: LinkPurpose, token: string): string {
  const url = new URL(LINK_PAGES[purpose], appUrl);
  url.hash = `token=${token}`;
  return url.toString();
}

function invitationEmail(user: User, link: string, expiresAt: Date): AccountEmail {
  return {
    to: user.email,
    subject: 'Invitación a ARZA ONE',
    text: [
      greeting(user),
      'Lo invitaron a ARZA ONE, la plataforma de ARZA TECH. Para activar su cuenta y crear su contraseña, abra este enlace:',
      link,
      `El enlace sirve una sola vez y vence el ${BOGOTA_DATE_TIME.format(expiresAt)} (hora de Colombia).`,
      'Si no esperaba esta invitación, ignore este correo.',
      SIGNATURE,
    ].join('\n\n'),
  };
}

function passwordResetEmail(user: User, link: string, expiresAt: Date): AccountEmail {
  return {
    to: user.email,
    subject: 'Recuperación de su contraseña de ARZA ONE',
    text: [
      greeting(user),
      'Recibimos una solicitud para crear una contraseña nueva para su cuenta. Para hacerlo, abra este enlace:',
      link,
      `El enlace sirve una sola vez y vence el ${BOGOTA_DATE_TIME.format(expiresAt)} (hora de Colombia).`,
      'Si usted no lo pidió, ignore este correo: su contraseña actual sigue funcionando.',
      SIGNATURE,
    ].join('\n\n'),
  };
}

function passwordChangedEmail(user: User, changedAt: Date): AccountEmail {
  return {
    to: user.email,
    subject: 'Su contraseña de ARZA ONE cambió',
    text: [
      greeting(user),
      `La contraseña de su cuenta cambió el ${BOGOTA_DATE_TIME.format(changedAt)} (hora de Colombia). Por seguridad, se cerraron todas sus sesiones.`,
      'Si usted no hizo este cambio, pida una contraseña nueva desde «¿Olvidó su contraseña?» y avise de inmediato al responsable técnico de su empresa.',
      SIGNATURE,
    ].join('\n\n'),
  };
}

/** Una invitación solo se envía a una cuenta invitada; la recuperación, a una cuenta activa. */
function eligible(user: User, purpose: LinkPurpose): boolean {
  return purpose === 'invitation' ? user.status === 'invited' : canSignIn(user);
}

async function issueLink(
  tx: TenantTransaction,
  user: User,
  purpose: LinkPurpose,
  deps: AccountEmailDependencies,
): Promise<AccountEmail> {
  const now = deps.clock.now();
  const secret = newSecretToken();
  const expiresAt = linkExpiresAt(purpose, now);
  await expirePendingLinks(tx, user.id, purpose, now);
  const token = await tx.token.create({
    data: { tenantId: user.tenantId, userId: user.id, purpose, tokenHash: secret.hash, expiresAt },
  });
  await recordAuditEvent(tx, {
    tenantId: user.tenantId,
    occurredAt: now,
    actor: { kind: 'system' },
    action: 'iam.link.issue',
    entityType: 'iam_token',
    entityId: token.id,
    result: 'success',
    changes: { purpose, user_id: user.id, expires_at: expiresAt.toISOString() },
    meta: null,
  });
  const link = linkUrl(deps.appUrl, purpose, secret.token);
  return purpose === 'invitation'
    ? invitationEmail(user, link, expiresAt)
    : passwordResetEmail(user, link, expiresAt);
}

/**
 * Prepara el correo del trabajo dentro de la empresa del trabajo. Devuelve null si ya no aplica
 * (la cuenta no existe o cambió de estado): reintentar no serviría.
 */
export async function prepareAccountEmail(
  job: AccountEmailJob,
  deps: AccountEmailDependencies,
): Promise<AccountEmail | null> {
  const context = { tenantId: job.tenantId, userId: job.userId };
  return deps.database.withTenant(context, async (tx) => {
    const user = await loadUser(tx, job.accountUserId);
    if (user === null) return null;
    if (job.purpose === 'password_changed') {
      return user.passwordChangedAt === null
        ? null
        : passwordChangedEmail(user, user.passwordChangedAt);
    }
    return eligible(user, job.purpose) ? issueLink(tx, user, job.purpose, deps) : null;
  });
}
