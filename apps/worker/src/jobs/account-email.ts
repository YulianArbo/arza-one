import { JOBS, type AccountEmailJob } from '@arza/api/platform';
import { prepareAccountEmail, type AccountEmailDependencies } from '@arza/api/iam';
import { UnrecoverableError } from 'bullmq';

import type { Mailer } from '../mail/mailer.js';

export interface AccountEmailJobDependencies extends AccountEmailDependencies {
  readonly mailer: Pick<Mailer, 'send'>;
}

/** Datos del trabajo validados. Si no cumplen el esquema, reintentar no sirve de nada. */
function parseAccountEmailJob(data: unknown): AccountEmailJob {
  const parsed = JOBS.accountEmail.schema.safeParse(data);
  if (!parsed.success) {
    throw new UnrecoverableError('Los datos del trabajo no son válidos; no se reintenta.');
  }
  return parsed.data;
}

/**
 * Correo de una cuenta (B08): invitación, recuperación o aviso de cambio de contraseña. El enlace
 * se crea aquí, al enviar (módulo de identidad). Si la cuenta ya no existe o cambió de estado, no
 * hay nada que enviar y no se reintenta. Si el envío falla, BullMQ reintenta con un enlace nuevo.
 * Devuelve si envió el correo.
 */
export async function processAccountEmail(
  data: unknown,
  deps: AccountEmailJobDependencies,
): Promise<boolean> {
  const job = parseAccountEmailJob(data);
  const email = await prepareAccountEmail(job, deps);
  if (email === null) return false;
  await deps.mailer.send(email);
  return true;
}
