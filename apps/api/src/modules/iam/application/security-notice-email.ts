import type { User } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { AccountEmailPurpose } from '../../../platform/queues/jobs.js';
import { describeDevice } from '../domain/device.js';
import { RECOVERY_CODES_LOW } from '../domain/second-factor-policy.js';
import { latestDevice, remainingRecoveryCodes } from '../infrastructure/second-factor-store.js';
import { bogotaDateTime, greeting, SIGNATURE, type AccountEmail } from './email-format.js';

// Avisos de seguridad a la persona (B09, «Eventos y alertas de seguridad»): cada cambio de su
// segundo factor y cada entrada desde un equipo nuevo. Nunca llevan códigos ni secretos.

const NOTICES = [
  'mfa_enabled',
  'mfa_changed',
  'mfa_disabled',
  'mfa_reset',
  'recovery_codes_regenerated',
  'recovery_code_used',
  'new_device',
] as const satisfies readonly AccountEmailPurpose[];

export type SecurityNotice = (typeof NOTICES)[number];

export function isSecurityNotice(purpose: AccountEmailPurpose): purpose is SecurityNotice {
  return (NOTICES as readonly string[]).includes(purpose);
}

const IF_NOT_YOU =
  'Si no fue usted, cambie su contraseña de inmediato desde «Mi perfil» o con «¿Olvidó su contraseña?», y avise al responsable técnico de su empresa.';

interface NoticeText {
  readonly subject: string;
  readonly body: (when: string) => string;
}

const TEXTS: Readonly<
  Record<Exclude<SecurityNotice, 'recovery_code_used' | 'new_device'>, NoticeText>
> = {
  mfa_enabled: {
    subject: 'Activó el segundo factor en ARZA ONE',
    body: (when) =>
      `El ${when} (hora de Colombia) se activó el segundo factor de su cuenta. Desde ahora, al iniciar sesión se le pedirá el código de su aplicación. Guarde sus códigos de recuperación en un lugar seguro.`,
  },
  mfa_changed: {
    subject: 'Cambió el celular de su segundo factor en ARZA ONE',
    body: (when) =>
      `El ${when} (hora de Colombia) se configuró el segundo factor de su cuenta en otro celular o aplicación. El anterior ya no sirve, los códigos de recuperación anteriores tampoco, y se cerraron sus demás sesiones.`,
  },
  mfa_disabled: {
    subject: 'Desactivó el segundo factor en ARZA ONE',
    body: (when) =>
      `El ${when} (hora de Colombia) se desactivó el segundo factor de su cuenta y se cerraron sus demás sesiones. Desde ahora se entra solo con la contraseña.`,
  },
  mfa_reset: {
    subject: 'Se reinició el segundo factor de su cuenta de ARZA ONE',
    body: (when) =>
      `El ${when} (hora de Colombia) el responsable técnico reinició el segundo factor de su cuenta y cerró todas sus sesiones. La próxima vez que entre deberá configurarlo de nuevo con su celular.`,
  },
  recovery_codes_regenerated: {
    subject: 'Generó códigos de recuperación nuevos en ARZA ONE',
    body: (when) =>
      `El ${when} (hora de Colombia) se generaron diez códigos de recuperación nuevos para su cuenta. Los anteriores ya no sirven.`,
  },
};

function emailOf(user: User, subject: string, body: string): AccountEmail {
  return {
    to: user.email,
    subject,
    text: [greeting(user), body, IF_NOT_YOU, SIGNATURE].join('\n\n'),
  };
}

async function recoveryCodeUsedEmail(
  tx: TenantTransaction,
  user: User,
  when: string,
): Promise<AccountEmail> {
  const remaining = await remainingRecoveryCodes(tx, user.id);
  const advice =
    remaining <= RECOVERY_CODES_LOW
      ? ' Le quedan pocos: genere códigos nuevos desde «Mi perfil».'
      : '';
  return emailOf(
    user,
    'Usó un código de recuperación en ARZA ONE',
    `El ${when} (hora de Colombia) se usó uno de sus códigos de recuperación para entrar a su cuenta. Le quedan ${String(remaining)}.${advice}`,
  );
}

async function newDeviceEmail(
  tx: TenantTransaction,
  user: User,
  when: string,
): Promise<AccountEmail> {
  const device = await latestDevice(tx, user.id);
  const { browser, os } = describeDevice(device?.userAgent ?? null);
  const which = [browser, os].filter((part) => part !== null).join(' en ');
  const described = which === '' ? 'un equipo que no habíamos visto' : `un equipo nuevo (${which})`;
  return emailOf(
    user,
    'Nuevo inicio de sesión en su cuenta de ARZA ONE',
    `El ${when} (hora de Colombia) se inició sesión en su cuenta desde ${described}. Si fue usted, no tiene que hacer nada. Puede revisar y cerrar sus sesiones en «Mi perfil» › «Sesiones activas».`,
  );
}

/** Prepara el aviso dentro de la empresa del trabajo. */
export async function securityNoticeEmail(
  tx: TenantTransaction,
  user: User,
  notice: SecurityNotice,
  occurredAt: Date,
): Promise<AccountEmail> {
  const when = bogotaDateTime(occurredAt);
  if (notice === 'recovery_code_used') return recoveryCodeUsedEmail(tx, user, when);
  if (notice === 'new_device') return newDeviceEmail(tx, user, when);
  const text = TEXTS[notice];
  return emailOf(user, text.subject, text.body(when));
}
