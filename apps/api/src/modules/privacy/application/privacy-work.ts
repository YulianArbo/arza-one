import {
  personalDataReportSchema,
  PRIVACY_REQUEST_KINDS,
  privacyRequestEventKindSchema,
  privacyRequestKindSchema,
  type PrivacyRequestEventKind,
} from '@arza/contracts';
import {
  institutionalFooter,
  institutionalHeader,
  personalDataReportBody,
  printedDate,
  printPage,
} from '@arza/templates';

import type { PrivacyRequest, PrivacyRequestEvent } from '../../../generated/prisma/client.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import { companyIdentity, toCalendarDate, type CompanyIdentity } from '../../core/index.js';
import { storeGeneratedPdf, type FileStorage } from '../../doc/index.js';
import { shownDateTime } from './personal-data-sources.js';

// El worker de Privacidad, cada 30 segundos y solo en las empresas con trabajo (B42): envía al
// titular los correos de su solicitud (constancia, requerimiento, prórroga, respuesta y cierre por
// desistimiento) y arma el PDF de la entrega de sus datos (decisión 6). Repetirlo no cambia nada; si
// el correo, Gotenberg o el almacenamiento no responden, lo pendiente queda para la siguiente pasada.

export interface PrivacyMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface PrivacyHtml {
  readonly index: string;
  readonly header: string;
  readonly footer: string;
  readonly landscape: boolean;
}

export interface PrivacyWorkDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
  readonly mailer: { send(message: PrivacyMail): Promise<void> };
  readonly storage: Pick<FileStorage, 'read' | 'put' | 'delete'>;
  readonly convertHtml: (document: PrivacyHtml) => Promise<Buffer>;
}

export interface PrivacyWorkResult {
  readonly mails: number;
  readonly exports: number;
}

const BATCH = 20;
const MAX_ATTEMPTS = 5;

const REPORT_FORMAT = {
  code: 'PRV-DAT',
  name: 'DATOS PERSONALES DEL TITULAR',
  version: '01',
  date: '—',
};

function scopeOf(tenantId: string) {
  return { tenantId, userId: null };
}

function dueText(row: PrivacyRequest): string {
  return row.dueOn === null
    ? 'queda suspendido hasta que complete su reclamo'
    : `vence el ${printedDate(toCalendarDate(row.dueOn))}`;
}

const MAIL_BODIES: Partial<
  Record<
    PrivacyRequestEventKind,
    (row: PrivacyRequest, event: PrivacyRequestEvent) => readonly [string, string]
  >
> = {
  received: (row) => [
    `Recibimos su solicitud ${row.code}`,
    `Recibimos su ${PRIVACY_REQUEST_KINDS[privacyRequestKindSchema.parse(row.kind)].toLowerCase()} sobre sus datos personales el ${shownDateTime(row.receivedAt) ?? ''}. Su código es ${row.code} y el plazo para responderle ${dueText(row)}. Puede consultar el estado en el sitio web con el código y este correo.`,
  ],
  requirement: (row, event) => [
    `Necesitamos completar su reclamo ${row.code}`,
    `Para tramitar su reclamo necesitamos lo siguiente:\n\n${event.note ?? ''}\n\nMientras tanto el plazo queda suspendido. Si en dos meses no recibimos la información, entenderemos que desistió del reclamo (Ley 1581 de 2012, art. 15).`,
  ],
  extended: (row, event) => [
    `Ampliamos el plazo de su solicitud ${row.code}`,
    `Necesitamos más tiempo para responderle. Motivo: ${event.note ?? ''}\n\nEl nuevo plazo ${dueText(row)}.`,
  ],
  responded: (row) => [`Respuesta a su solicitud ${row.code}`, row.response ?? ''],
  desisted: (row) => [
    `Cerramos su reclamo ${row.code}`,
    'Pasaron dos meses sin recibir la información que le pedimos, así que entendemos que desistió del reclamo (Ley 1581 de 2012, art. 15). Puede presentar uno nuevo cuando quiera.',
  ],
};

function mailOf(
  row: PrivacyRequest,
  event: PrivacyRequestEvent,
  company: CompanyIdentity,
): PrivacyMail | null {
  const body = MAIL_BODIES[privacyRequestEventKindSchema.parse(event.kind)];
  if (body === undefined || row.requesterEmail === null) return null;
  const [subject, text] = body(row, event);
  return {
    to: row.requesterEmail,
    subject,
    text: [
      `Hola, ${row.requesterName}:`,
      text,
      `${company.legalName} · NIT ${company.taxId}\nEste es un correo automático de ARZA ONE; no lo responda.`,
    ].join('\n\n'),
  };
}

async function sendOne(
  deps: PrivacyWorkDependencies,
  tenantId: string,
  eventId: string,
): Promise<boolean> {
  const prepared = await deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const event = await tx.privacyRequestEvent.findFirst({
      where: { id: eventId, mailPending: true, deletedAt: null },
      include: { request: true },
    });
    return event === null
      ? null
      : { event, mail: mailOf(event.request, event, await companyIdentity(tx)) };
  });
  if (prepared === null) return false;
  if (prepared.mail !== null) await deps.mailer.send(prepared.mail);
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const at = deps.clock.now();
    const { count } = await tx.privacyRequestEvent.updateMany({
      where: { id: eventId, mailPending: true },
      data: { mailPending: false, mailedAt: prepared.mail === null ? null : at },
    });
    if (count === 0) return false;
    await recordAuditEvent(tx, {
      tenantId,
      occurredAt: at,
      actor: { kind: 'system' },
      action: 'privacy.request.mail',
      entityType: 'prv_request',
      entityId: prepared.event.requestId,
      result: 'success',
      changes: { kind: prepared.event.kind, sent: prepared.mail !== null },
      meta: null,
    });
    return true;
  });
}

interface PreparedExport {
  readonly attempts: number;
  readonly code: string;
  readonly html: PrivacyHtml;
}

/** Cuenta el intento y arma el HTML; null si ya no está pendiente. */
async function prepareExport(
  deps: PrivacyWorkDependencies,
  tenantId: string,
  exportId: string,
): Promise<PreparedExport | null> {
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const found = await tx.privacyDataExport.findFirst({
      where: { id: exportId, status: 'pending', deletedAt: null },
    });
    if (found === null) return null;
    await tx.privacyDataExport.update({
      where: { id: exportId },
      data: { attempts: { increment: 1 } },
    });
    const report = personalDataReportSchema.parse(found.content);
    const company = await companyIdentity(tx);
    const body = personalDataReportBody({
      company: report.company,
      holder: report.holder,
      requestCode: report.request_code,
      generatedOn: shownDateTime(new Date(report.generated_at)) ?? '',
      sections: report.sections,
    });
    const html = {
      index: printPage(`Datos personales · ${report.request_code}`, body),
      header: institutionalHeader(REPORT_FORMAT, company),
      footer: institutionalFooter(company, report.request_code),
      landscape: false,
    };
    return { attempts: found.attempts + 1, code: report.request_code, html };
  });
}

async function storeExport(
  deps: PrivacyWorkDependencies,
  target: { readonly tenantId: string; readonly exportId: string; readonly code: string },
  content: Buffer,
): Promise<boolean> {
  const file = { tenantId: target.tenantId, fileName: `datos-${target.code}.pdf`, content };
  return storeGeneratedPdf(deps, file, async (tx, fileId, at) => {
    const { count } = await tx.privacyDataExport.updateMany({
      where: { id: target.exportId, status: 'pending' },
      data: { status: 'ready', pdfFileId: fileId, readyAt: at },
    });
    if (count === 0) return false;
    await recordAuditEvent(tx, {
      tenantId: target.tenantId,
      occurredAt: at,
      actor: { kind: 'system' },
      action: 'privacy.data.export_render',
      entityType: 'prv_data_export',
      entityId: target.exportId,
      result: 'success',
      changes: { request_code: target.code, file_id: fileId },
      meta: null,
    });
    return true;
  });
}

async function renderOne(
  deps: PrivacyWorkDependencies,
  tenantId: string,
  exportId: string,
): Promise<boolean> {
  const prepared = await prepareExport(deps, tenantId, exportId);
  if (prepared === null) return false;
  try {
    const content = await deps.convertHtml(prepared.html);
    return await storeExport(deps, { tenantId, exportId, code: prepared.code }, content);
  } catch (error) {
    // Tras varios intentos queda «No se pudo preparar» y el Oficial pide otra entrega.
    if (prepared.attempts < MAX_ATTEMPTS) throw error;
    await deps.database.withTenant(scopeOf(tenantId), (tx) =>
      tx.privacyDataExport.updateMany({
        where: { id: exportId, status: 'pending' },
        data: { status: 'failed' },
      }),
    );
    return false;
  }
}

async function tenantsWithWork(database: PrivacyWorkDependencies['database']): Promise<string[]> {
  const rows = await database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT prv_tenants_with_request_work() AS id`,
  );
  return rows.map((row) => row.id);
}

/** Correos pendientes al titular; devuelve cuántos se atendieron. */
async function sendPrivacyMail(deps: PrivacyWorkDependencies, tenantId: string): Promise<number> {
  const events = await deps.database.withTenant(scopeOf(tenantId), (tx) =>
    tx.privacyRequestEvent.findMany({
      where: { mailPending: true, deletedAt: null },
      select: { id: true },
      orderBy: { occurredAt: 'asc' },
      take: BATCH,
    }),
  );
  let sent = 0;
  for (const event of events) if (await sendOne(deps, tenantId, event.id)) sent += 1;
  return sent;
}

/** Entregas por convertir a PDF; devuelve cuántas quedaron listas. */
async function renderTenantExports(
  deps: PrivacyWorkDependencies,
  tenantId: string,
): Promise<number> {
  const rows = await deps.database.withTenant(scopeOf(tenantId), (tx) =>
    tx.privacyDataExport.findMany({
      where: { status: 'pending', deletedAt: null },
      select: { id: true },
      orderBy: { requestedAt: 'asc' },
      take: BATCH,
    }),
  );
  let ready = 0;
  for (const row of rows) if (await renderOne(deps, tenantId, row.id)) ready += 1;
  return ready;
}

/** Una pasada del worker en las empresas con trabajo (o en las dadas, para las pruebas). */
export async function runPrivacyWork(
  deps: PrivacyWorkDependencies,
  tenantIds?: readonly string[],
): Promise<PrivacyWorkResult> {
  let mails = 0;
  let exports = 0;
  for (const tenantId of tenantIds ?? (await tenantsWithWork(deps.database))) {
    mails += await sendPrivacyMail(deps, tenantId);
    exports += await renderTenantExports(deps, tenantId);
  }
  return { mails, exports };
}
