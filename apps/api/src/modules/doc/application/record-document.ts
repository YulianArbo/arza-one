import { FORM_RECORD_STATUSES, formDataSchema, formRecordStatusSchema } from '@arza/contracts';
import {
  fillDocxTemplate,
  formDocumentBody,
  htmlTemplatePage,
  institutionalFooter,
  institutionalHeader,
  printedDate,
  printPage,
  renderHtmlTemplate,
  templateContext,
  type DocumentIdentity,
  type RecordFacts,
  type TemplateContext,
} from '@arza/templates';

import type {
  DocFormRecord,
  DocFormTemplate,
  DocOutputTemplate,
} from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, companyIdentity } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { printedFormVersion } from '../domain/form-rules.js';
import type { FileStorage } from '../infrastructure/file-storage.js';
import type { HtmlDocument, SourceDocument } from '../infrastructure/gotenberg-converter.js';
import { definitionOf, layoutOf } from './form-template-views.js';

// El documento que se convierte a PDF para un registro diligenciado (B20, numeral 13.2): con la
// versión exacta del formato con que se creó, su plantilla de salida (HTML o Word) o la maqueta
// institucional, y el encabezado y el pie de la empresa. Los datos son los guardados en el registro.

const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export type RecordDocument =
  | { readonly kind: 'html'; readonly code: string; readonly html: HtmlDocument }
  | { readonly kind: 'word'; readonly code: string; readonly word: SourceDocument };

function dayOf(at: Date): string {
  return printedDate(bogotaToday(at));
}

type PendingRecord = DocFormRecord & {
  readonly template: DocFormTemplate & { readonly outputTemplate: DocOutputTemplate | null };
};

async function factsOf(tx: TenantTransaction, record: PendingRecord): Promise<RecordFacts> {
  const ids = [record.createdBy, record.approvedBy].filter((id) => id !== null);
  const people = await peopleById(tx, ids);
  const name = (id: string | null) => {
    const person = id === null ? undefined : people.get(id);
    return person?.displayName ?? person?.email ?? '';
  };
  return {
    code: record.code,
    status: FORM_RECORD_STATUSES[formRecordStatusSchema.parse(record.status)],
    createdBy: name(record.createdBy),
    createdOn: dayOf(record.createdAt),
    approvedBy: record.approvedBy === null ? null : name(record.approvedBy),
    approvedOn: record.approvedAt === null ? null : dayOf(record.approvedAt),
  };
}

function identityOf(template: DocFormTemplate): DocumentIdentity {
  return {
    code: template.code,
    name: template.name,
    version: printedFormVersion(template.formVersion),
    date: dayOf(template.publishedAt ?? template.createdAt),
  };
}

/** El Word de la plantilla de salida, lleno con los datos del registro. */
async function wordDocument(
  tx: TenantTransaction,
  storage: Pick<FileStorage, 'read'>,
  input: { readonly code: string; readonly fileId: string; readonly context: TemplateContext },
): Promise<RecordDocument> {
  const file = await tx.file.findFirstOrThrow({ where: { id: input.fileId } });
  const content = fillDocxTemplate(await storage.read(file.storageKey), input.context);
  return {
    kind: 'word',
    code: input.code,
    word: { fileName: `${input.code}.docx`, mimeType: WORD, content },
  };
}

/** El registro que espera su PDF, listo para convertir; null si ya no lo espera. */
export async function recordDocument(
  tx: TenantTransaction,
  storage: Pick<FileStorage, 'read'>,
  recordId: string,
): Promise<RecordDocument | null> {
  const record = await tx.docFormRecord.findFirst({
    where: { id: recordId, renderStatus: 'pending', deletedAt: null },
    include: { template: { include: { outputTemplate: true } } },
  });
  if (record === null) return null;
  const { template } = record;
  const definition = definitionOf(template);
  const data = formDataSchema(definition, 'draft').parse(record.data);
  const [facts, company] = await Promise.all([factsOf(tx, record), companyIdentity(tx)]);
  const identity = identityOf(template);
  const context = templateContext({ document: identity, company, facts }, definition, data);
  const output = template.outputTemplate;
  if (output !== null && output.fileId !== null) {
    return wordDocument(tx, storage, { code: record.code, fileId: output.fileId, context });
  }
  const body = output?.body ?? null;
  const page =
    body === null
      ? printPage(template.name, formDocumentBody(definition, data, facts))
      : htmlTemplatePage(template.name, renderHtmlTemplate(body, context));
  const header = institutionalHeader(identity, company);
  const footer = institutionalFooter(company, record.code);
  const landscape = layoutOf(template).orientation === 'landscape';
  return { kind: 'html', code: record.code, html: { index: page, header, footer, landscape } };
}
