import { createHash, randomBytes } from 'node:crypto';

import { printedDate, pesos } from '@arza/templates';

import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, companyIdentity, toCalendarDate } from '../../core/index.js';
import { storeGeneratedPdf, type FileStorage } from '../../doc/index.js';
import { moneyText } from '../domain/money.js';
import { linkExpiresAt } from '../domain/quote-rules.js';
import { recordCrmChange, type CrmActor } from './crm-support.js';
import { quoteEventPayload } from './quote-flow.js';
import { quoteFileName, quoteHtml, type QuoteHtml } from './quote-document.js';
import { quoteAudit } from './quote-records.js';

// Trabajo de las cotizaciones en el worker (B23). Cada pocos segundos: el PDF FT-COM-001 de cada
// versión aprobada y el correo con el enlace de cada cotización enviada. Cada día: las enviadas
// cuya vigencia pasó quedan vencidas. Repetirlo no cambia nada, porque solo toma lo pendiente.
// La llave del enlace solo existe en el correo: la base guarda su huella SHA-256.

export interface QuoteMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface QuoteWorkDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
  readonly storage: Pick<FileStorage, 'read' | 'put' | 'delete'>;
  readonly convertHtml: (document: QuoteHtml) => Promise<Buffer>;
  readonly mailer: { send(message: QuoteMail): Promise<void> };
  /** Dirección de la aplicación (APP_URL): el enlace del cliente va a su mismo dominio. */
  readonly appUrl: string;
}

export interface QuoteWorkResult {
  readonly pdfs: number;
  readonly emails: number;
}

/** Cuántas cotizaciones toma por empresa en cada pasada; las demás, en la siguiente. */
const BATCH = 25;

function systemActor(tenantId: string, at: Date): CrmActor {
  return { tenantId, userId: null, meta: null, at };
}

async function renderPdf(deps: QuoteWorkDependencies, tenantId: string, quoteId: string) {
  const scope = { tenantId, userId: null };
  const at = deps.clock.now();
  const html = await deps.database.withTenant(scope, async (tx) => {
    const quote = await tx.crmQuote.findFirst({
      where: { id: quoteId, status: 'approved', pdfStatus: 'pending', deletedAt: null },
    });
    return quote === null ? null : { quote, html: await quoteHtml(tx, quote, at) };
  });
  if (html === null) return false;
  const content = await deps.convertHtml(html.html);
  const sha256 = createHash('sha256').update(content).digest('hex');
  return storeGeneratedPdf(
    deps,
    { tenantId, fileName: quoteFileName(html.quote), content },
    async (tx, fileId, stored) => {
      const { count } = await tx.crmQuote.updateMany({
        where: { id: quoteId, status: 'approved', pdfStatus: 'pending' },
        data: { pdfStatus: 'ready', pdfFileId: fileId, pdfSha256: sha256 },
      });
      if (count === 0) return false;
      await recordCrmChange(tx, systemActor(tenantId, stored), {
        action: 'crm.quote.render',
        event: 'crm.quote.rendered',
        entityType: 'crm_quote',
        entityId: quoteId,
        changes: { code: html.quote.code, pdf_file_id: fileId, pdf_sha256: sha256 },
      });
      return true;
    },
  );
}

function linkUrl(appUrl: string, token: string): string {
  const url = new URL('/cotizacion', appUrl);
  url.hash = `token=${token}`;
  return url.toString();
}

/** Prepara el enlace nuevo y el correo; null si la cotización ya no espera su correo. */
async function prepareEmail(
  tx: TenantTransaction,
  deps: QuoteWorkDependencies,
  quoteId: string,
): Promise<QuoteMail | null> {
  const quote = await tx.crmQuote.findFirst({
    where: { id: quoteId, status: 'sent', emailSentAt: null, deletedAt: null },
  });
  if (quote === null) return null;
  const { recipientEmail, recipientName } = quote;
  if (recipientEmail === null || recipientName === null) return null;
  const token = randomBytes(32).toString('base64url');
  const validUntil = toCalendarDate(quote.validUntil);
  await tx.crmQuote.update({
    where: { id: quote.id },
    data: {
      linkTokenHash: createHash('sha256').update(token).digest('hex'),
      linkExpiresAt: linkExpiresAt(validUntil),
    },
  });
  const company = await companyIdentity(tx);
  const reference = `${quote.code} (versión ${String(quote.versionNumber)})`;
  return {
    to: recipientEmail,
    subject: `Cotización ${reference} de ${company.legalName}`,
    text: [
      `Hola, ${recipientName}:`,
      `${company.legalName} le envía la cotización ${reference} por ${pesos(moneyText(quote.total.toString()))}, impuestos incluidos.`,
      'En este enlace puede verla, descargar el PDF y aceptarla o rechazarla en línea:',
      linkUrl(deps.appUrl, token),
      `El enlace sirve hasta el ${printedDate(validUntil)} a las 11:59 p. m. (hora de Colombia), último día de la vigencia de la cotización.`,
      'Si no esperaba este correo, ignórelo.',
      `${company.legalName} · NIT ${company.taxId}\nEste es un correo automático; no lo responda.`,
    ].join('\n\n'),
  };
}

async function sendEmail(deps: QuoteWorkDependencies, tenantId: string, quoteId: string) {
  const scope = { tenantId, userId: null };
  const email = await deps.database.withTenant(scope, (tx) => prepareEmail(tx, deps, quoteId));
  if (email === null) return false;
  await deps.mailer.send(email);
  // Si esto falla después de enviar, la pasada siguiente envía otro enlace y el anterior deja de
  // servir: el cliente siempre puede usar el último.
  return deps.database.withTenant(scope, async (tx) => {
    const at = deps.clock.now();
    const { count } = await tx.crmQuote.updateMany({
      where: { id: quoteId, status: 'sent', emailSentAt: null },
      data: { emailSentAt: at },
    });
    if (count === 0) return false;
    const quote = await tx.crmQuote.findFirstOrThrow({ where: { id: quoteId } });
    await recordCrmChange(tx, systemActor(tenantId, at), {
      action: 'crm.quote.email',
      event: 'crm.quote.emailed',
      entityType: 'crm_quote',
      entityId: quoteId,
      changes: {
        code: quote.code,
        version_number: quote.versionNumber,
        recipient_email: quote.recipientEmail,
        link_expires_at: quote.linkExpiresAt?.toISOString() ?? null,
      },
    });
    return true;
  });
}

async function pendingOf(deps: QuoteWorkDependencies, tenantId: string) {
  return deps.database.withTenant({ tenantId, userId: null }, async (tx) => ({
    pdfs: await tx.crmQuote.findMany({
      where: { status: 'approved', pdfStatus: 'pending', deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    }),
    emails: await tx.crmQuote.findMany({
      where: { status: 'sent', emailSentAt: null, deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: BATCH,
    }),
  }));
}

/** Genera los PDF pendientes y envía los correos pendientes de todas las empresas. */
export async function processPendingQuotes(deps: QuoteWorkDependencies): Promise<QuoteWorkResult> {
  const tenants = await deps.database.withoutTenant(
    (tx) => tx.$queryRaw<{ id: string }[]>`SELECT crm_tenants_with_quote_work() AS id`,
  );
  let pdfs = 0;
  let emails = 0;
  for (const { id: tenantId } of tenants) {
    const pending = await pendingOf(deps, tenantId);
    for (const { id } of pending.pdfs) if (await renderPdf(deps, tenantId, id)) pdfs += 1;
    for (const { id } of pending.emails) if (await sendEmail(deps, tenantId, id)) emails += 1;
  }
  return { pdfs, emails };
}

async function expireTenant(
  deps: Pick<QuoteWorkDependencies, 'database'>,
  tenantId: string,
  at: Date,
  today: string,
) {
  const scope = { tenantId, userId: null };
  const due = await deps.database.withTenant(scope, (tx) =>
    tx.crmQuote.findMany({
      where: {
        status: 'sent',
        validUntil: { lt: new Date(`${today}T00:00:00.000Z`) },
        deletedAt: null,
      },
      select: { id: true },
    }),
  );
  let expired = 0;
  for (const { id } of due) {
    const done = await deps.database.withTenant(scope, async (tx) => {
      const quote = await tx.crmQuote.findFirst({ where: { id, status: 'sent' } });
      if (quote === null) return false;
      await tx.crmQuote.update({ where: { id }, data: { status: 'expired', closedAt: at } });
      await recordCrmChange(tx, systemActor(tenantId, at), {
        action: 'crm.quote.expire',
        event: 'crm.quote.expired',
        entityType: 'crm_quote',
        entityId: id,
        changes: { ...quoteAudit(quote), status: ['sent', 'expired'] },
        payload: quoteEventPayload(quote),
      });
      return true;
    });
    if (done) expired += 1;
  }
  return expired;
}

/** Vence las cotizaciones enviadas cuya vigencia ya pasó. Devuelve cuántas venció. */
export async function expireQuotes(
  deps: Pick<QuoteWorkDependencies, 'database' | 'clock'>,
): Promise<number> {
  const at = deps.clock.now();
  const today = bogotaToday(at);
  const tenants = await deps.database.withoutTenant(
    (tx) =>
      tx.$queryRaw<{ id: string }[]>`SELECT crm_tenants_with_expired_quotes(${today}::date) AS id`,
  );
  let expired = 0;
  for (const { id } of tenants) expired += await expireTenant(deps, id, at, today);
  return expired;
}
