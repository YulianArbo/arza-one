import { Inject, Injectable } from '@nestjs/common';
import {
  outputEngineSchema,
  outputTemplateStatusSchema,
  type CreateOutputTemplate,
  type FormPreviewResponse,
  type OutputEngine,
  type OutputTemplate,
  type OutputTemplateListQuery,
  type OutputTemplateListResponse,
  type UpdateOutputTemplate,
} from '@arza/contracts';
import {
  docxTemplateVariables,
  htmlTemplatePage,
  htmlTemplateVariables,
  renderHtmlTemplate,
  TemplateSyntaxError,
} from '@arza/templates';
import { z } from 'zod';

import type { DocOutputTemplate } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { peopleById } from '../../iam/index.js';
import { outputTemplateActions } from '../domain/form-rules.js';
import { FileStorage } from '../infrastructure/file-storage.js';
import { actorOf, auditDoc, type DocActor } from './doc-support.js';
import {
  outputTemplateInvalid,
  outputTemplateNotEditable,
  outputTemplateNotFound,
} from './form-messages.js';
import { previewPage, sampleContext } from './form-preview.js';

// Plantillas de salida (B20, numeral 13.2): HTML con variables {{nombre}} o Word con variables
// {nombre}. Se escriben en borrador; al publicarse quedan inmutables y la anterior del mismo código
// pasa a retirada. Al guardar se revisa la sintaxis y se anotan las variables que usa.

const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const variablesSchema = z.array(z.string());

interface TemplateTarget {
  readonly id: string;
  readonly version: number;
}

interface Content {
  readonly body: string | null;
  readonly fileId: string | null;
  readonly variables: string[];
}

function audited(template: DocOutputTemplate) {
  return {
    code: template.code,
    engine: template.engine,
    output_version: template.outputVersion,
    status: template.status,
    file_id: template.fileId,
  };
}

@Injectable()
export class OutputTemplatesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}

  async list(
    principal: Principal,
    query: OutputTemplateListQuery,
  ): Promise<OutputTemplateListResponse> {
    const rows = await this.database.withTenant(principal, (tx) =>
      tx.docOutputTemplate.findMany({
        where: { deletedAt: null, ...(query.status === undefined ? {} : { status: query.status }) },
        orderBy: [{ code: 'asc' }, { outputVersion: 'desc' }],
      }),
    );
    return { data: rows.map((row) => summary(row)) };
  }

  async get(principal: Principal, id: string): Promise<OutputTemplate> {
    return this.database.withTenant(principal, async (tx) => view(tx, await findTemplate(tx, id)));
  }

  async create(
    principal: Principal,
    input: CreateOutputTemplate,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const previous = await tx.docOutputTemplate.findFirst({
        where: { code: input.code, deletedAt: null },
        orderBy: { outputVersion: 'desc' },
      });
      if (previous !== null && previous.engine !== input.engine) {
        throw outputTemplateInvalid('Esa plantilla ya existe con otro tipo (HTML o Word).');
      }
      if (previous?.status === 'draft') {
        throw outputTemplateNotEditable(
          'Esa plantilla ya tiene un borrador. Edítelo o publíquelo.',
        );
      }
      const content = await this.content(tx, principal.userId, input.engine, input);
      const created = await tx.docOutputTemplate.create({
        data: {
          tenantId: actor.tenantId,
          code: input.code,
          name: input.name,
          engine: input.engine,
          outputVersion: (previous?.outputVersion ?? 0) + 1,
          ...content,
        },
      });
      await audit(tx, actor, 'doc.output_template.create', created);
      return created.id;
    });
  }

  async update(
    principal: Principal,
    target: TemplateTarget,
    input: UpdateOutputTemplate,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const found = await editable(tx, target);
      const engine = outputEngineSchema.parse(found.engine);
      const content = await this.content(tx, principal.userId, engine, input);
      const updated = await tx.docOutputTemplate.update({
        where: { id: found.id },
        data: { name: input.name, ...content },
      });
      await audit(tx, actor, 'doc.output_template.update', updated);
    });
  }

  async publish(principal: Principal, target: TemplateTarget, meta: RequestMeta): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const found = await editable(tx, target);
      await tx.docOutputTemplate.updateMany({
        where: { code: found.code, status: 'published', deletedAt: null },
        data: { status: 'retired', retiredAt: actor.at },
      });
      const published = await tx.docOutputTemplate.update({
        where: { id: found.id },
        data: { status: 'published', publishedAt: actor.at, publishedBy: principal.userId },
      });
      await audit(tx, actor, 'doc.output_template.publish', published);
    });
  }

  /** La plantilla llena con valores de ejemplo, con el encabezado y el pie institucionales. */
  async preview(principal: Principal, id: string): Promise<FormPreviewResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const template = await findTemplate(tx, id);
      const variables = variablesSchema.parse(template.variables);
      const identity = { code: template.code, name: template.name, version: '01' };
      if (template.body === null) {
        const list = variables.map((name) => `<li>{${name}}</li>`).join('');
        const body = `<p>Plantilla en Word. Variables que usa:</p><ul>${list}</ul>`;
        const html = htmlTemplatePage(template.name, body);
        return { html: await previewPage(tx, identity, { html, at: this.clock.now() }) };
      }
      const filled = renderHtmlTemplate(template.body, sampleContext(variables, identity));
      const html = htmlTemplatePage(template.name, filled);
      return { html: await previewPage(tx, identity, { html, at: this.clock.now() }) };
    });
  }

  /** Revisa el contenido según el tipo y anota sus variables. */
  private async content(
    tx: TenantTransaction,
    userId: string,
    engine: OutputEngine,
    input: { readonly body: string | null; readonly file_id: string | null },
  ): Promise<Content> {
    try {
      if (engine === 'html') {
        if (input.body === null || input.file_id !== null)
          throw new TemplateSyntaxError('falta el HTML.');
        return { body: input.body, fileId: null, variables: htmlTemplateVariables(input.body) };
      }
      if (input.file_id === null || input.body !== null)
        throw new TemplateSyntaxError('falta el Word.');
      const file = await tx.file.findFirst({
        where: { id: input.file_id, createdBy: userId, scanStatus: 'available', mimeType: WORD },
      });
      if (file === null) throw new TemplateSyntaxError('el Word no está disponible o no es suyo.');
      const variables = docxTemplateVariables(await this.storage.read(file.storageKey));
      return { body: null, fileId: file.id, variables };
    } catch (error) {
      if (error instanceof TemplateSyntaxError) throw outputTemplateInvalid(error.message);
      throw error;
    }
  }
}

async function findTemplate(tx: TenantTransaction, id: string): Promise<DocOutputTemplate> {
  const template = await tx.docOutputTemplate.findFirst({ where: { id, deletedAt: null } });
  if (template === null) throw outputTemplateNotFound();
  return template;
}

async function editable(tx: TenantTransaction, target: TemplateTarget): Promise<DocOutputTemplate> {
  const found = await findTemplate(tx, target.id);
  if (found.version !== target.version) throw versionConflict();
  if (found.status !== 'draft') {
    throw outputTemplateNotEditable('Una plantilla publicada no cambia. Cree una versión nueva.');
  }
  return found;
}

async function audit(
  tx: TenantTransaction,
  actor: DocActor,
  action: string,
  template: DocOutputTemplate,
): Promise<void> {
  await auditDoc(tx, actor, {
    action,
    entityType: 'doc_output_template',
    entityId: template.id,
    changes: audited(template),
  });
}

function summary(row: DocOutputTemplate) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    engine: outputEngineSchema.parse(row.engine),
    output_version: row.outputVersion,
    status: outputTemplateStatusSchema.parse(row.status),
    published_at: row.publishedAt?.toISOString() ?? null,
    version: row.version,
  };
}

async function view(tx: TenantTransaction, row: DocOutputTemplate): Promise<OutputTemplate> {
  const [file, people, drafts] = await Promise.all([
    row.fileId === null ? null : tx.file.findFirst({ where: { id: row.fileId } }),
    peopleById(tx, row.publishedBy === null ? [] : [row.publishedBy]),
    tx.docOutputTemplate.count({ where: { code: row.code, status: 'draft', deletedAt: null } }),
  ]);
  const publisher = row.publishedBy === null ? undefined : people.get(row.publishedBy);
  const base = summary(row);
  return {
    ...base,
    body: row.body,
    file: file === null ? null : { id: file.id, file_name: file.fileName },
    variables: variablesSchema.parse(row.variables),
    published_by:
      row.publishedBy === null
        ? null
        : {
            id: row.publishedBy,
            name: publisher?.displayName ?? publisher?.email ?? 'Persona retirada',
          },
    actions: outputTemplateActions(base.status, drafts > 0),
  };
}
