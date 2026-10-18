import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateFormRecord,
  DownloadLinkResponse,
  FormRecord,
  FormRecordListQuery,
  FormRecordListResponse,
  FormRecordStep,
  FormRecordStepRequest,
  UpdateFormRecord,
} from '@arza/contracts';

import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordSecurityEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { nextBusinessCode } from '../../core/index.js';
import { decideAsParticipant, requestTransition, startWorkflow } from '../../wf/index.js';
import { FORM_RECORD_ENTITY } from '../domain/form-flows.js';
import { recordSequenceKey } from '../domain/form-rules.js';
import { FileStorage } from '../infrastructure/file-storage.js';
import { integrityFailed, transitionNotAllowed } from './doc-messages.js';
import { actorOf, readerOf, type DocActor } from './doc-support.js';
import { FileLinkIssuer } from './file-link-issuer.js';
import { assertEntity } from './form-entities.js';
import { formTemplateNotFound } from './form-messages.js';
import { completion } from './form-record-flow.js';
import {
  auditRecord,
  findVisible,
  json,
  listWhere,
  ownDraft,
  readyPdf,
  validData,
  type ReadyPdf,
  type RecordTarget,
} from './form-record-rows.js';
import { recordSummaries, recordView, type RecordRow } from './form-record-views.js';
import { formReaderOf, type FormReader } from './form-support.js';
import { DOC_PARTY_LOOKUP, type DocPartyLookup } from './party-lookup.js';

// Registros diligenciados de los formatos digitales (B20, ficha 17.4): se guardan como borrador
// (lo incompleto se acepta), se envían con todo lo obligatorio y, si el formato lo pide, pasan por
// aprobación en el motor de flujos. Cada registro queda amarrado a la versión exacta del formato
// con que se creó y lleva el código FT-COM-002-AAAA-NNNN. La auditoría nunca guarda los valores
// diligenciados: pueden traer datos personales.

interface Caller {
  readonly principal: Principal;
  readonly ability: AppAbility;
  readonly meta: RequestMeta;
}

@Injectable()
export class FormRecordsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DOC_PARTY_LOOKUP) private readonly parties: DocPartyLookup,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(FileLinkIssuer) private readonly issuer: FileLinkIssuer,
  ) {}

  async create(caller: Caller, input: CreateFormRecord): Promise<string> {
    const { principal, ability, meta } = caller;
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const template = await tx.docFormTemplate.findFirst({
        where: { id: input.template_id, status: 'published', fillMode: 'manual', deletedAt: null },
      });
      if (template === null) throw formTemplateNotFound();
      const reader = await readerOf(tx, principal, ability);
      const ref = { entityType: input.entity_type, entityId: input.entity_id };
      await assertEntity(tx, { reader, parties: this.parties }, template, ref);
      const data = validData({ template }, input.data, 'draft');
      const code = await nextBusinessCode(tx, recordSequenceKey(template.code), actor.at, {
        name: `Registros ${template.code}`,
        prefix: template.code,
        padding: 4,
      });
      const record = await tx.docFormRecord.create({
        data: {
          tenantId: actor.tenantId,
          templateId: template.id,
          templateVersion: template.formVersion,
          code,
          data: json(data),
          classification: template.classification,
          entityType: input.entity_type,
          entityId: input.entity_id,
        },
      });
      await auditRecord(tx, actor, 'doc.form_record.create', {
        id: record.id,
        code,
        template_code: template.code,
        template_version: template.formVersion,
        entity_type: input.entity_type,
        entity_id: input.entity_id,
      });
      return record.id;
    });
  }

  async list(
    principal: Principal,
    ability: AppAbility,
    query: FormRecordListQuery,
  ): Promise<FormRecordListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const reader = formReaderOf(tx, principal, ability);
      const rows = await tx.docFormRecord.findMany({
        where: listWhere(reader, query),
        include: { template: true },
        orderBy: { id: 'desc' },
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
        take: query.limit + 1,
      });
      const page = rows.slice(0, query.limit);
      const next = rows.length > query.limit ? (page.at(-1)?.id ?? null) : null;
      return { data: await recordSummaries(tx, this.parties, page), next_cursor: next };
    });
  }

  async get(principal: Principal, ability: AppAbility, id: string): Promise<FormRecord> {
    const at = this.clock.now();
    return this.database.withTenant(principal, async (tx) => {
      const reader = formReaderOf(tx, principal, ability);
      const row = await findVisible(tx, reader, id);
      return recordView(tx, { reader, parties: this.parties, at }, row);
    });
  }

  /** Guarda el borrador propio; acepta lo incompleto pero no lo que no cumple su tipo. */
  async update(caller: Caller, target: RecordTarget, input: UpdateFormRecord): Promise<void> {
    const { principal, ability, meta } = caller;
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const row = await ownDraft(tx, formReaderOf(tx, principal, ability), target);
      const data = validData(row, input.data, 'draft');
      await tx.docFormRecord.update({ where: { id: row.id }, data: { data: json(data) } });
      await auditRecord(tx, actor, 'doc.form_record.update', {
        id: row.id,
        code: row.code,
        fields: Object.keys(data).sort(),
      });
    });
  }

  /** Enviar (con todo lo obligatorio), aprobar o devolver. */
  async step(
    caller: Caller,
    target: RecordTarget,
    step: FormRecordStep,
    input: FormRecordStepRequest,
  ): Promise<void> {
    const { principal, ability, meta } = caller;
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const reader = formReaderOf(tx, principal, ability);
      if (step === 'submit') {
        await this.submit(tx, { actor, reader, ability }, await ownDraft(tx, reader, target));
        return;
      }
      const row = await findVisible(tx, reader, target.id);
      if (row.version !== target.version) throw versionConflict();
      if (row.status !== 'in_approval' || row.workflowInstanceId === null)
        throw transitionNotAllowed();
      await decideAsParticipant(tx, actor, {
        instanceId: row.workflowInstanceId,
        actor: await reader.taskActor(actor.at),
        decision: step === 'approve' ? 'approved' : 'rejected',
        comment: input.comment,
      });
    });
  }

  /** Enlace de descarga del PDF, después de verificar su huella. */
  async pdfLink(
    principal: Principal,
    ability: AppAbility,
    id: string,
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    const resolved = await this.database.withTenant(principal, (tx) =>
      readyPdf(tx, formReaderOf(tx, principal, ability), id),
    );
    const content = await this.storage.read(resolved.file.storageKey);
    if (createHash('sha256').update(content).digest('hex') !== resolved.file.sha256) {
      await this.reportTampering(principal, resolved, meta);
      throw integrityFailed();
    }
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const current = await readyPdf(tx, formReaderOf(tx, principal, ability), id);
      const link = await this.issuer.issue(principal, 'download', current.file.id);
      await auditRecord(tx, actor, 'doc.form_record.download_link', {
        id: current.row.id,
        code: current.row.code,
        expires_at: link.expires_at,
      });
      return link;
    });
  }

  private async submit(
    tx: TenantTransaction,
    context: {
      readonly actor: DocActor;
      readonly reader: FormReader;
      readonly ability: AppAbility;
    },
    row: RecordRow,
  ): Promise<void> {
    const { actor, reader, ability } = context;
    validData(row, row.data, 'final');
    const key = row.template.workflowKey;
    if (key === null) {
      const { count } = await tx.docFormRecord.updateMany({
        where: { id: row.id, status: 'draft' },
        data: { ...completion(actor.at), submittedAt: actor.at },
      });
      if (count === 0) throw transitionNotAllowed();
      await auditRecord(tx, actor, 'doc.form_record.complete', { id: row.id, code: row.code });
      return;
    }
    const instanceId = row.workflowInstanceId ?? (await this.startFlow(tx, actor, row, key));
    await requestTransition(tx, actor, {
      instanceId,
      action: 'submit',
      comment: null,
      facts: {},
      actor: await reader.taskActor(actor.at),
      hasPermission: (code) => hasPermission(ability, code),
    });
  }

  private async startFlow(
    tx: TenantTransaction,
    actor: DocActor,
    row: RecordRow,
    key: string,
  ): Promise<string> {
    const instance = await startWorkflow(tx, actor, {
      key,
      entityType: FORM_RECORD_ENTITY,
      entityId: row.id,
      title: `${row.code} · ${row.template.name}`,
      facts: {},
    });
    await tx.docFormRecord.update({
      where: { id: row.id },
      data: { workflowInstanceId: instance.id },
    });
    return instance.id;
  }

  private async reportTampering(
    principal: Principal,
    resolved: ReadyPdf,
    meta: RequestMeta,
  ): Promise<void> {
    await this.database.withTenant(principal, (tx) =>
      recordSecurityEvent(tx, {
        tenantId: principal.tenantId,
        occurredAt: this.clock.now(),
        type: 'doc.file.integrity_failed',
        userId: principal.userId,
        severity: 'high',
        detail: {
          file_id: resolved.file.id,
          form_record_id: resolved.row.id,
          code: resolved.row.code,
        },
        meta,
      }),
    );
  }
}
