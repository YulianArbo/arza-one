import {
  formClassificationSchema,
  formEntityTypeSchema,
  formRecordSchema,
  formRecordStatusSchema,
  pdfStatusSchema,
  type FormRecord,
  type FormRecordSummary,
} from '@arza/contracts';

import type { DocFormRecord, DocFormTemplate } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { peopleById } from '../../iam/index.js';
import { participationOf, type Participation } from '../../wf/index.js';
import { recordActions } from '../domain/form-rules.js';
import { entityLabels } from './form-entities.js';
import type { FormReader } from './form-support.js';
import { definitionOf, layoutOf } from './form-template-views.js';
import type { DocPartyLookup } from './party-lookup.js';

// Vista de los registros diligenciados (B20): con los campos de la versión exacta del formato con
// que se creó, el paso de su aprobación y lo que la persona puede hacer ahora.

export type RecordRow = DocFormRecord & { readonly template: DocFormTemplate };

interface Lookups {
  readonly people: ReadonlyMap<string, string>;
  readonly entities: ReadonlyMap<string, string>;
}

async function lookups(
  tx: TenantTransaction,
  parties: DocPartyLookup,
  rows: readonly RecordRow[],
): Promise<Lookups> {
  const ids = rows.flatMap((r) => [r.createdBy, r.approvedBy].filter((id) => id !== null));
  const people = await peopleById(tx, ids);
  return {
    people: new Map([...people].map(([id, p]) => [id, p.displayName ?? p.email])),
    entities: await entityLabels(tx, parties, rows),
  };
}

function person(found: Lookups, id: string | null): FormRecordSummary['created_by'] {
  return id === null ? null : { id, name: found.people.get(id) ?? 'Persona retirada' };
}

function summaryOf(row: RecordRow, found: Lookups): FormRecordSummary {
  const entityType = row.entityType === null ? null : formEntityTypeSchema.parse(row.entityType);
  return {
    id: row.id,
    code: row.code,
    status: formRecordStatusSchema.parse(row.status),
    template: {
      id: row.template.id,
      code: row.template.code,
      name: row.template.name,
      form_version: row.templateVersion,
    },
    entity:
      entityType === null || row.entityId === null
        ? null
        : {
            type: entityType,
            id: row.entityId,
            label: found.entities.get(row.entityId) ?? 'Registro retirado',
          },
    classification: formClassificationSchema.parse(row.classification),
    created_by: person(found, row.createdBy),
    created_at: row.createdAt.toISOString(),
    submitted_at: row.submittedAt?.toISOString() ?? null,
    pdf_status: pdfStatusSchema.parse(row.renderStatus),
    version: row.version,
  };
}

export async function recordSummaries(
  tx: TenantTransaction,
  parties: DocPartyLookup,
  rows: readonly RecordRow[],
): Promise<FormRecordSummary[]> {
  const found = await lookups(tx, parties, rows);
  return rows.map((row) => summaryOf(row, found));
}

async function participation(
  tx: TenantTransaction,
  reader: FormReader,
  row: RecordRow,
  at: Date,
): Promise<Participation | null> {
  if (row.status !== 'in_approval' || row.workflowInstanceId === null) return null;
  return participationOf(tx, row.workflowInstanceId, await reader.taskActor(at));
}

export async function recordView(
  tx: TenantTransaction,
  context: { readonly reader: FormReader; readonly parties: DocPartyLookup; readonly at: Date },
  row: RecordRow,
): Promise<FormRecord> {
  const { reader } = context;
  const found = await lookups(tx, context.parties, [row]);
  const summary = summaryOf(row, found);
  const step = await participation(tx, reader, row, context.at);
  return {
    ...summary,
    definition: definitionOf(row.template),
    layout: layoutOf(row.template),
    data: formRecordSchema.shape.data.parse(row.data),
    approved_by: person(found, row.approvedBy),
    approved_at: row.approvedAt?.toISOString() ?? null,
    return_note: row.returnNote,
    step: step === null || step.completed ? null : step.stateLabel,
    actions: recordActions(
      { status: summary.status, pdfStatus: summary.pdf_status, step: step?.stateKey ?? null },
      {
        isAuthor: row.createdBy === reader.userId,
        canFill: reader.canFill,
        canApprove: reader.canApprove,
        attendsApproval: step?.attendsApproval ?? false,
      },
    ),
  };
}
