import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateFormTemplate,
  FormPreviewResponse,
  FormTemplate,
  FormTemplateListQuery,
  FormTemplateListResponse,
  UpdateFormTemplate,
} from '@arza/contracts';
import { formDocumentBody, htmlTemplatePage, printPage, renderHtmlTemplate } from '@arza/templates';

import type { DocFormTemplate, Prisma } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { printedFormVersion } from '../domain/form-rules.js';
import { actorOf, auditDoc, type DocActor } from './doc-support.js';
import { formTemplateNotEditable, formTemplateNotFound } from './form-messages.js';
import { previewPage, sampleContext } from './form-preview.js';
import { formReaderOf } from './form-support.js';
import { definitionOf, templateSummary, templateView } from './form-template-views.js';

// Formatos digitales (B20, ficha 17.4 y capítulo 18, forma B): Calidad diseña el formato en
// borrador y lo publica; cada publicación es una versión nueva e inmutable y la anterior del mismo
// código pasa a retirada. Los registros conservan siempre la versión con que se crearon.

interface TemplateTarget {
  readonly id: string;
  readonly version: number;
}

type TemplateContent = Omit<UpdateFormTemplate, 'definition' | 'layout'> & {
  readonly definition: Prisma.InputJsonObject;
  readonly layout: Prisma.InputJsonObject;
};

function columns(input: TemplateContent) {
  return {
    name: input.name,
    definition: input.definition,
    layout: input.layout,
    documentId: input.document_id,
    outputTemplateId: input.output_template_id,
    workflowKey: input.workflow_key,
    classification: input.classification,
    entityType: input.entity_type,
  };
}

function audited(template: DocFormTemplate): Prisma.InputJsonObject {
  return {
    code: template.code,
    form_version: template.formVersion,
    status: template.status,
    workflow_key: template.workflowKey,
    output_template_id: template.outputTemplateId,
    classification: template.classification,
    field_count: definitionOf(template).sections.reduce((n, s) => n + s.fields.length, 0),
  };
}

async function audit(
  tx: TenantTransaction,
  actor: DocActor,
  action: string,
  template: DocFormTemplate,
): Promise<void> {
  await auditDoc(tx, actor, {
    action,
    entityType: 'doc_form_template',
    entityId: template.id,
    changes: audited(template),
  });
}

/** Lo que el formato toma de otros registros: su documento y su plantilla de salida publicada. */
type References = Pick<UpdateFormTemplate, 'document_id' | 'output_template_id' | 'entity_type'>;

async function assertReferences(
  tx: TenantTransaction,
  input: References,
  fillMode: string,
): Promise<void> {
  if (input.entity_type === 'doc_change_request' && fillMode === 'manual') {
    throw formTemplateNotEditable(
      'Solo la plataforma llena un formato desde una solicitud documental.',
    );
  }
  if (input.document_id !== null) {
    const found = await tx.docDocument.count({ where: { id: input.document_id, deletedAt: null } });
    if (found === 0) throw formTemplateNotEditable('El documento del Listado Maestro no existe.');
  }
  if (input.output_template_id !== null) {
    const found = await tx.docOutputTemplate.count({
      where: { id: input.output_template_id, status: 'published', deletedAt: null },
    });
    if (found === 0) throw formTemplateNotEditable('Elija una plantilla de salida publicada.');
  }
}

function content(input: UpdateFormTemplate): TemplateContent {
  return { ...input, definition: { ...input.definition }, layout: { ...input.layout } };
}

async function findTemplate(tx: TenantTransaction, id: string): Promise<DocFormTemplate> {
  const template = await tx.docFormTemplate.findFirst({ where: { id, deletedAt: null } });
  if (template === null) throw formTemplateNotFound();
  return template;
}

async function inStatus(
  tx: TenantTransaction,
  target: TemplateTarget,
  status: 'draft' | 'published',
): Promise<DocFormTemplate> {
  const found = await findTemplate(tx, target.id);
  if (found.version !== target.version) throw versionConflict();
  if (found.status === status) return found;
  throw formTemplateNotEditable(
    status === 'draft'
      ? 'Un formato publicado no cambia. Cree una versión nueva.'
      : 'Solo se retira la versión publicada de un formato.',
  );
}

@Injectable()
export class FormTemplatesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    principal: Principal,
    query: FormTemplateListQuery,
  ): Promise<FormTemplateListResponse> {
    const filters: Prisma.DocFormTemplateWhereInput[] = [{ deletedAt: null }];
    if (query.status !== undefined) filters.push({ status: query.status });
    if (query.code !== undefined) filters.push({ code: query.code });
    if (query.fillable === 'true') filters.push({ status: 'published', fillMode: 'manual' });
    const rows = await this.database.withTenant(principal, (tx) =>
      tx.docFormTemplate.findMany({
        where: { AND: filters },
        orderBy: [{ code: 'asc' }, { formVersion: 'desc' }],
      }),
    );
    return { data: rows.map(templateSummary) };
  }

  async get(principal: Principal, ability: AppAbility, id: string): Promise<FormTemplate> {
    return this.database.withTenant(principal, async (tx) => {
      const reader = formReaderOf(tx, principal, ability);
      return templateView(tx, reader, await findTemplate(tx, id));
    });
  }

  /** Formato nuevo, o versión nueva en borrador del mismo código. */
  async create(
    principal: Principal,
    input: CreateFormTemplate,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const previous = await tx.docFormTemplate.findFirst({
        where: { code: input.code, deletedAt: null },
        orderBy: { formVersion: 'desc' },
      });
      if (previous?.status === 'draft') {
        throw formTemplateNotEditable('Ese formato ya tiene un borrador. Edítelo o publíquelo.');
      }
      const fillMode = previous?.fillMode ?? 'manual';
      await assertReferences(tx, input, fillMode);
      const created = await tx.docFormTemplate.create({
        data: {
          tenantId: actor.tenantId,
          code: input.code,
          formVersion: (previous?.formVersion ?? 0) + 1,
          fillMode,
          ...columns(content(input)),
        },
      });
      await audit(tx, actor, 'doc.form_template.create', created);
      return created.id;
    });
  }

  async update(
    principal: Principal,
    target: TemplateTarget,
    input: UpdateFormTemplate,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const found = await inStatus(tx, target, 'draft');
      await assertReferences(tx, input, found.fillMode);
      const updated = await tx.docFormTemplate.update({
        where: { id: found.id },
        data: columns(content(input)),
      });
      await audit(tx, actor, 'doc.form_template.update', updated);
    });
  }

  /** La versión en borrador queda en uso; la publicada anterior pasa a retirada. */
  async publish(principal: Principal, target: TemplateTarget, meta: RequestMeta): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const found = await inStatus(tx, target, 'draft');
      // La plantilla de salida pudo retirarse mientras el formato estaba en borrador.
      const references = {
        document_id: found.documentId,
        output_template_id: found.outputTemplateId,
        entity_type: null,
      };
      await assertReferences(tx, references, found.fillMode);
      await tx.docFormTemplate.updateMany({
        where: { code: found.code, status: 'published', deletedAt: null },
        data: { status: 'retired', retiredAt: actor.at },
      });
      const published = await tx.docFormTemplate.update({
        where: { id: found.id },
        data: { status: 'published', publishedAt: actor.at, publishedBy: principal.userId },
      });
      await audit(tx, actor, 'doc.form_template.publish', published);
    });
  }

  /** El formato deja de diligenciarse; sus registros se conservan con su versión. */
  async retire(principal: Principal, target: TemplateTarget, meta: RequestMeta): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const found = await inStatus(tx, target, 'published');
      const retired = await tx.docFormTemplate.update({
        where: { id: found.id },
        data: { status: 'retired', retiredAt: actor.at },
      });
      await audit(tx, actor, 'doc.form_template.retire', retired);
    });
  }

  /** El formato vacío como se imprimirá, o su plantilla de salida con valores de ejemplo. */
  async preview(principal: Principal, id: string): Promise<FormPreviewResponse> {
    const at = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const template = await findTemplate(tx, id);
      const definition = definitionOf(template);
      const identity = {
        code: template.code,
        name: template.name,
        version: printedFormVersion(template.formVersion),
      };
      const output =
        template.outputTemplateId === null
          ? null
          : await tx.docOutputTemplate.findFirst({ where: { id: template.outputTemplateId } });
      const keys = definition.sections.flatMap((s) => s.fields.map((f) => f.key));
      const html =
        output?.body === null || output === null
          ? printPage(template.name, formDocumentBody(definition, {}, SAMPLE_FACTS))
          : htmlTemplatePage(
              template.name,
              renderHtmlTemplate(output.body, sampleContext(keys, identity)),
            );
      return { html: await previewPage(tx, identity, { html, at }) };
    });
  }
}

const SAMPLE_FACTS = {
  code: '[código del registro]',
  status: 'Borrador',
  createdBy: '[quien diligencia]',
  createdOn: '[fecha]',
  approvedBy: null,
  approvedOn: null,
};
