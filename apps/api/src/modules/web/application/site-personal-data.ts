import { SITE_FORMS, siteFormKeySchema, SITE_FORM_RETENTION_YEARS } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { outcomeFor, shownDateTime, type PersonalDataSource } from '../../privacy/index.js';
import { recordWebAudit, type WebActor } from './web-support.js';

// Lo que el sitio guarda de un titular, para Privacidad (B42): sus formularios, sus aceptaciones de
// textos legales y su baja de comunicaciones. Los formularios se vuelven anónimos a pedido del
// titular o a los dos años (decisión 10); quedan la fecha, la versión del aviso y el prospecto.
// Las aceptaciones y la baja se conservan: son la prueba y lo que evita volver a escribirle.

/** Lo que queda de un formulario anónimo: la misma forma, sin datos de la persona. */
const ANONYMOUS_DATA = {
  first_name: 'Datos',
  last_name: 'suprimidos',
  phone: null,
  company: null,
  detail: 'Datos suprimidos.',
};

const CONTENT_LABELS: Readonly<Record<string, string>> = {
  first_name: 'Nombres',
  last_name: 'Apellidos',
  phone: 'Teléfono',
  company: 'Empresa',
  detail: 'Mensaje',
  service: 'Servicio',
  timeframe: 'Plazo',
};

/** Lo que la persona escribió en el formulario, con su etiqueta. */
function contentFields(data: Prisma.JsonValue): { label: string; value: string | null }[] {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(CONTENT_LABELS).map(([key, label]) => {
    const value = data[key];
    return { label, value: typeof value === 'string' ? value : null };
  });
}

async function anonymize(
  tx: TenantTransaction,
  actor: WebActor,
  where: Prisma.WebFormSubmissionWhereInput,
  reason: 'holder_request' | 'retention',
): Promise<number> {
  const rows = await tx.webFormSubmission.findMany({
    where: { ...where, anonymizedAt: null, deletedAt: null },
    select: { id: true, code: true },
  });
  for (const row of rows) {
    await tx.webFormSubmission.update({
      where: { id: row.id },
      data: {
        email: null,
        data: ANONYMOUS_DATA,
        ip: null,
        userAgent: null,
        mailPending: false,
        unsubscribeTokenHash: null,
        anonymizedAt: actor.at,
      },
    });
    await recordWebAudit(tx, actor, {
      action: 'web.form.anonymize',
      entityType: 'web_form_submission',
      entityId: row.id,
      changes: { code: row.code, reason },
    });
  }
  return rows.length;
}

export const SITE_PERSONAL_DATA: PersonalDataSource = {
  key: 'web',
  title: 'Sitio web',
  async collect(tx, holder) {
    const submissions = await tx.webFormSubmission.findMany({
      where: { email: { in: [...holder.emails] }, deletedAt: null },
      orderBy: { receivedAt: 'asc' },
    });
    const acceptances = await tx.webLegalAcceptance.findMany({
      where: { partyId: holder.partyId, deletedAt: null },
      orderBy: { acceptedAt: 'asc' },
    });
    const unsubscribes = await tx.webUnsubscribe.findMany({
      where: { email: { in: [...holder.emails] }, deletedAt: null },
    });
    return [
      ...submissions.map((row) => ({
        title: `${SITE_FORMS[siteFormKeySchema.parse(row.formKey)]} ${row.code}`,
        fields: [
          { label: 'Recibido', value: shownDateTime(row.receivedAt) },
          { label: 'Correo', value: row.email },
          ...contentFields(row.data),
          { label: 'Versión del aviso aceptado', value: String(row.noticeVersion) },
        ],
      })),
      ...acceptances.map((row) => ({
        title: 'Aceptación de un texto legal',
        fields: [{ label: 'Aceptado', value: shownDateTime(row.acceptedAt) }],
      })),
      ...unsubscribes.map((row) => ({
        title: 'Baja de comunicaciones comerciales',
        fields: [
          { label: 'Correo', value: row.email },
          { label: 'Desde', value: shownDateTime(row.unsubscribedAt) },
        ],
      })),
    ];
  },
  async erase(tx, holder, actor) {
    const erased = await anonymize(
      tx,
      actor,
      { email: { in: [...holder.emails] } },
      'holder_request',
    );
    const kept =
      (await tx.webLegalAcceptance.count({ where: { partyId: holder.partyId, deletedAt: null } })) +
      (await tx.webUnsubscribe.count({
        where: { email: { in: [...holder.emails] }, deletedAt: null },
      }));
    if (kept > 0) {
      return outcomeFor(
        erased + kept,
        'kept',
        'Las aceptaciones de textos legales y la baja de comunicaciones se conservan como prueba; los formularios quedaron anónimos.',
      );
    }
    return outcomeFor(erased, 'erased');
  },
};

export interface SiteRetentionDependencies {
  readonly database: Pick<DatabaseService, 'withTenant'>;
  readonly clock: Clock;
}

/** Vuelve anónimos los formularios de más de dos años de la empresa; devuelve cuántos. */
export async function anonymizeExpiredSubmissions(
  deps: SiteRetentionDependencies,
  tenantId: string,
): Promise<number> {
  const at = deps.clock.now();
  const cutoff = new Date(at);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - SITE_FORM_RETENTION_YEARS);
  const actor: WebActor = { tenantId, userId: null, at, meta: null };
  return deps.database.withTenant({ tenantId, userId: null }, (tx) =>
    anonymize(tx, actor, { receivedAt: { lt: cutoff } }, 'retention'),
  );
}
