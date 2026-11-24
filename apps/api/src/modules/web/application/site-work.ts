import { randomBytes } from 'node:crypto';

import { SITE_FORMS, siteFormKeySchema } from '@arza/contracts';

import type { WebFormSubmission } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import { companyIdentity, type CompanyIdentity } from '../../core/index.js';
import { unsubscribeTokenHash } from './submissions.js';
import { recordWebAudit } from './web-support.js';

// Acuse de los formularios del sitio (B41) en el worker, cada 30 segundos y solo en las empresas
// con acuses pendientes. Al preparar el correo se crea la llave de baja (decisión 9): va después de
// «#», que el navegador no envía al servidor, y solo se guarda su huella. Si el correo no responde,
// la pasada siguiente crea otra llave y lo vuelve a intentar.

export interface SiteMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface SiteWorkDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
  readonly mailer: { send(message: SiteMail): Promise<void> };
  /** Dirección de la aplicación (APP_URL): los enlaces van a su mismo dominio. */
  readonly appUrl: string;
}

const BATCH = 25;

/** La página pública de baja, con la llave después de «#». */
function unsubscribeUrl(appUrl: string, token: string): string {
  const url = new URL('/baja', appUrl);
  url.hash = `token=${token}`;
  return url.toString();
}

function ackMail(
  row: WebFormSubmission & { readonly email: string },
  company: CompanyIdentity,
  link: string,
): SiteMail {
  const form = SITE_FORMS[siteFormKeySchema.parse(row.formKey)].toLowerCase();
  return {
    to: row.email,
    subject: `Recibimos su ${form}: ${row.code}`,
    text: [
      'Hola:',
      `${company.legalName} recibió su ${form} por el sitio web. Su referencia es ${row.code}.`,
      'Un consultor revisará su solicitud y le escribirá por este medio o por teléfono.',
      'Si no desea recibir comunicaciones comerciales de nuestra parte, dese de baja con un clic:',
      link,
      `${company.legalName} · NIT ${company.taxId}\nEste es un correo automático de ARZA ONE; no lo responda.`,
    ].join('\n\n'),
  };
}

function systemActor(tenantId: string, at: Date) {
  return { tenantId, userId: null, at, meta: null };
}

function scopeOf(tenantId: string) {
  return { tenantId, userId: null };
}

/** Prepara el correo con una llave nueva; null si ya no está pendiente. */
async function prepareAck(deps: SiteWorkDependencies, tenantId: string, id: string) {
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const row = await tx.webFormSubmission.findFirst({
      where: { id, mailPending: true, deletedAt: null },
    });
    if (row === null) return null;
    if (row.email === null) return null;
    const token = randomBytes(32).toString('base64url');
    await tx.webFormSubmission.update({
      where: { id },
      data: { unsubscribeTokenHash: unsubscribeTokenHash(token) },
    });
    await recordWebAudit(tx, systemActor(tenantId, deps.clock.now()), {
      action: 'web.unsubscribe.link.issue',
      entityType: 'web_form_submission',
      entityId: id,
      changes: { code: row.code },
    });
    return ackMail(
      { ...row, email: row.email },
      await companyIdentity(tx),
      unsubscribeUrl(deps.appUrl, token),
    );
  });
}

async function sendAck(deps: SiteWorkDependencies, tenantId: string, id: string) {
  const mail = await prepareAck(deps, tenantId, id);
  if (mail === null) return false;
  await deps.mailer.send(mail);
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const at = deps.clock.now();
    const { count } = await tx.webFormSubmission.updateMany({
      where: { id, mailPending: true },
      data: { mailPending: false, ackSentAt: at },
    });
    if (count === 0) return false;
    await recordWebAudit(tx, systemActor(tenantId, at), {
      action: 'web.form.acknowledge',
      entityType: 'web_form_submission',
      entityId: id,
      changes: { mail: 'ack' },
    });
    return true;
  });
}

async function workTenant(deps: SiteWorkDependencies, tenantId: string): Promise<number> {
  const rows = await deps.database.withTenant(scopeOf(tenantId), (tx) =>
    tx.webFormSubmission.findMany({
      where: { mailPending: true, deletedAt: null },
      select: { id: true },
      orderBy: { receivedAt: 'asc' },
      take: BATCH,
    }),
  );
  let sent = 0;
  for (const row of rows) if (await sendAck(deps, tenantId, row.id)) sent += 1;
  return sent;
}

/** Las empresas con acuses por enviar. */
async function tenantsWithSiteWork(
  deps: Pick<SiteWorkDependencies, 'database'>,
): Promise<string[]> {
  const rows = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT web_tenants_with_mail_work() AS id`,
  );
  return rows.map((row) => row.id);
}

/** Envía los acuses pendientes de las empresas dadas; devuelve cuántos salieron. */
export async function sendSiteMailIn(
  deps: SiteWorkDependencies,
  tenantIds: readonly string[],
): Promise<number> {
  let sent = 0;
  for (const id of tenantIds) sent += await workTenant(deps, id);
  return sent;
}

export async function sendSiteMail(deps: SiteWorkDependencies): Promise<number> {
  return sendSiteMailIn(deps, await tenantsWithSiteWork(deps));
}
