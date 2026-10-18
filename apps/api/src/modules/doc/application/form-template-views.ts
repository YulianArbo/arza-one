import {
  formClassificationSchema,
  formDefinitionSchema,
  formEntityTypeSchema,
  formFields,
  formFillModeSchema,
  formFlowKeySchema,
  formLayoutSchema,
  formTemplateStatusSchema,
  type FormDefinition,
  type FormLayout,
  type FormTemplate,
  type FormTemplateSummary,
} from '@arza/contracts';

import type { DocFormTemplate } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { peopleById } from '../../iam/index.js';
import { templateActions } from '../domain/form-rules.js';
import type { FormReader } from './form-support.js';

// Vista de los formatos digitales (B20). Los campos se guardan en jsonb y se leen siempre con su
// esquema: lo que no lo cumpla no llega a la pantalla.

export function definitionOf(template: Pick<DocFormTemplate, 'definition'>): FormDefinition {
  return formDefinitionSchema.parse(template.definition);
}

export function layoutOf(template: Pick<DocFormTemplate, 'layout'>): FormLayout {
  return formLayoutSchema.parse(template.layout);
}

export function templateSummary(row: DocFormTemplate): FormTemplateSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    form_version: row.formVersion,
    status: formTemplateStatusSchema.parse(row.status),
    fill_mode: formFillModeSchema.parse(row.fillMode),
    workflow_key: row.workflowKey === null ? null : formFlowKeySchema.parse(row.workflowKey),
    classification: formClassificationSchema.parse(row.classification),
    entity_type: row.entityType === null ? null : formEntityTypeSchema.parse(row.entityType),
    field_count: formFields(definitionOf(row)).length,
    published_at: row.publishedAt?.toISOString() ?? null,
    version: row.version,
  };
}

async function references(tx: TenantTransaction, row: DocFormTemplate) {
  const [document, output, drafts, people] = await Promise.all([
    row.documentId === null
      ? null
      : tx.docDocument.findFirst({
          where: { id: row.documentId },
          select: { id: true, code: true, title: true },
        }),
    row.outputTemplateId === null
      ? null
      : tx.docOutputTemplate.findFirst({ where: { id: row.outputTemplateId } }),
    tx.docFormTemplate.count({ where: { code: row.code, status: 'draft', deletedAt: null } }),
    peopleById(tx, row.publishedBy === null ? [] : [row.publishedBy]),
  ]);
  return { document, output, draftExists: drafts > 0, people };
}

export async function templateView(
  tx: TenantTransaction,
  reader: FormReader,
  row: DocFormTemplate,
): Promise<FormTemplate> {
  const found = await references(tx, row);
  const summary = templateSummary(row);
  const publisher = row.publishedBy === null ? undefined : found.people.get(row.publishedBy);
  return {
    ...summary,
    definition: definitionOf(row),
    layout: layoutOf(row),
    document:
      found.document === null
        ? null
        : { id: found.document.id, code: found.document.code, name: found.document.title },
    output_template:
      found.output === null
        ? null
        : {
            id: found.output.id,
            code: found.output.code,
            name: found.output.name,
            output_version: found.output.outputVersion,
          },
    published_by:
      row.publishedBy === null
        ? null
        : {
            id: row.publishedBy,
            name: publisher?.displayName ?? publisher?.email ?? 'Persona retirada',
          },
    actions: templateActions(
      { status: summary.status, fillMode: summary.fill_mode, draftExists: found.draftExists },
      { manages: reader.managesTemplates, fills: reader.canFill },
    ),
  };
}
