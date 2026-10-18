import {
  dispositionCertificateBody,
  institutionalFooter,
  institutionalHeader,
  printedDate,
  printPage,
  type DispositionCertificate,
  type DocumentIdentity,
} from '@arza/templates';

import type { DocDispositionProposal } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, companyIdentity, toCalendarDate } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import type { HtmlDocument } from '../infrastructure/gotenberg-converter.js';

// El Acta de disposición final en PDF (B21): con el encabezado del RE-SGC-005 (su versión vigente
// si está cargado en la plataforma), lo eliminado, lo conservado y quién revisó y aprobó.

const RETENTION_TABLE = 'RE-SGC-005';
const TITLE = 'Acta de disposición final de documentos';

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** 2026-10-01 → «octubre de 2026». */
export function periodLabel(period: string): string {
  const month = MONTHS[Number(period.slice(5, 7)) - 1] ?? '';
  return `${month} de ${period.slice(0, 4)}`;
}

function dayOf(at: Date | null): string {
  return at === null ? '' : printedDate(bogotaToday(at));
}

/** El encabezado: el RE-SGC-005 con su versión vigente; sin él, la fecha del acta. */
async function identityOf(tx: TenantTransaction, at: Date): Promise<DocumentIdentity> {
  const table = await tx.docDocument.findFirst({
    where: { code: RETENTION_TABLE, status: 'current', deletedAt: null },
  });
  const versionId = table?.currentVersionId ?? null;
  const version =
    versionId === null ? null : await tx.docVersion.findFirst({ where: { id: versionId } });
  const effective = version?.effectiveDate ?? null;
  return {
    code: RETENTION_TABLE,
    name: TITLE,
    version: version?.versionLabel ?? '—',
    date: effective === null ? dayOf(at) : printedDate(toCalendarDate(effective)),
  };
}

type Item = Awaited<ReturnType<typeof itemsOf>>[number];

async function itemsOf(tx: TenantTransaction, proposalId: string) {
  return tx.docDisposition.findMany({
    where: { proposalId, deletedAt: null },
    include: { document: true, retentionRule: true },
    orderBy: { document: { code: 'asc' } },
  });
}

function seriesOf(item: Item): string {
  return `${item.retentionRule.code} · ${item.retentionRule.name}`;
}

function disposedLines(items: readonly Item[]): DispositionCertificate['disposed'] {
  return items
    .filter((item) => item.action === 'destroy')
    .map((item) => ({
      code: item.document.code,
      title: item.document.title,
      series: seriesOf(item),
      dueOn: printedDate(toCalendarDate(item.dueOn)),
      legalBasis: item.retentionRule.legalBasis,
    }));
}

function keptLines(items: readonly Item[]): DispositionCertificate['kept'] {
  return items
    .filter((item) => item.action === 'keep')
    .map((item) => ({
      code: item.document.code,
      title: item.document.title,
      series: seriesOf(item),
      reason: item.keepReason ?? '',
    }));
}

async function certificateOf(
  tx: TenantTransaction,
  proposal: DocDispositionProposal,
  at: Date,
): Promise<DispositionCertificate> {
  const items = await itemsOf(tx, proposal.id);
  const people = await peopleById(
    tx,
    [proposal.sentBy, proposal.decidedBy].filter((id) => id !== null),
  );
  const name = (id: string | null) => {
    const person = id === null ? undefined : people.get(id);
    return person?.displayName ?? person?.email ?? '';
  };
  return {
    code: proposal.code,
    period: periodLabel(toCalendarDate(proposal.period)),
    proposedOn: dayOf(proposal.createdAt),
    sentBy: name(proposal.sentBy),
    sentOn: dayOf(proposal.sentAt),
    approvedBy: name(proposal.decidedBy),
    approvedOn: dayOf(proposal.decidedAt),
    executedOn: dayOf(at),
    disposed: disposedLines(items),
    kept: keptLines(items),
  };
}

/** El acta lista para convertir a PDF con Gotenberg. */
export async function certificateDocument(
  tx: TenantTransaction,
  proposal: DocDispositionProposal,
  at: Date,
): Promise<HtmlDocument> {
  const [identity, company, certificate] = await Promise.all([
    identityOf(tx, at),
    companyIdentity(tx),
    certificateOf(tx, proposal, at),
  ]);
  const page = printPage(`${TITLE} ${proposal.code}`, dispositionCertificateBody(certificate));
  return {
    index: page,
    header: institutionalHeader(identity, company),
    footer: institutionalFooter(company, proposal.code),
    landscape: false,
  };
}
