import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  SITE_ERROR_CODES,
  type ApproveLegalText,
  type CreateLegalText,
  type LegalText,
  type LegalTextKey,
  type PublicLegalText,
  type UpdateLegalText,
} from '@arza/contracts';

import type { WebLegalText } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { isAttachableFile } from '../../doc/index.js';
import {
  optionalRef,
  recordWebChange,
  userRefs,
  webActorOf,
  webConflict,
  webInvalid,
  webNotFound,
  type Target,
  type WebActor,
} from './web-support.js';

// Textos legales del sitio (B41, numeral 20.2): borrador → aprobado → publicado → reemplazado.
// Los redacta quien tiene «Editar textos legales»; los aprueba y publica quien tiene «Publicar
// textos legales», y nadie aprueba lo que redactó (decisión 2). Lo publicado no cambia.

type LegalRow = WebLegalText;

function selfApproval(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    SITE_ERROR_CODES.selfApproval,
    'Un texto legal lo aprueba una persona distinta de quien lo redactó.',
  );
}

function legalView(row: LegalRow, refs: Map<string, { id: string; name: string }>): LegalText {
  return {
    id: row.id,
    key: row.key as LegalTextKey,
    version_number: row.versionNumber,
    title: row.title,
    body: row.body,
    status: row.status as LegalText['status'],
    drafted_by: optionalRef(refs, row.draftedBy),
    approved_by: optionalRef(refs, row.approvedBy),
    approved_at: row.approvedAt?.toISOString() ?? null,
    concept_file_id: row.conceptFileId,
    effective_from: row.effectiveFrom?.toISOString() ?? null,
    version: row.version,
  };
}

export function publicLegalView(row: LegalRow): PublicLegalText {
  return {
    id: row.id,
    key: row.key as LegalTextKey,
    title: row.title,
    body: row.body,
    version_number: row.versionNumber,
    effective_from: (row.effectiveFrom ?? row.updatedAt).toISOString(),
  };
}

/** La versión publicada de una clase de texto, o null. */
export async function publishedLegalText(
  tx: TenantTransaction,
  key: LegalTextKey,
): Promise<LegalRow | null> {
  return tx.webLegalText.findFirst({ where: { key, status: 'published', deletedAt: null } });
}

async function rowOf(tx: TenantTransaction, id: string): Promise<LegalRow> {
  const row = await tx.webLegalText.findFirst({ where: { id, deletedAt: null } });
  if (row === null) throw webNotFound('El texto legal no existe.');
  return row;
}

/** Cambia el estado solo si la versión y el estado esperados coinciden. */
async function moveText(
  tx: TenantTransaction,
  target: Target,
  from: LegalRow['status'],
  data: Partial<Pick<LegalRow, 'status' | 'approvedBy' | 'approvedAt' | 'conceptFileId'>> & {
    effectiveFrom?: Date;
  },
): Promise<void> {
  const { count } = await tx.webLegalText.updateMany({
    where: { id: target.id, version: target.version, status: from, deletedAt: null },
    data,
  });
  if (count === 1) return;
  const row = await rowOf(tx, target.id);
  if (row.version !== target.version) throw versionConflict();
  throw webConflict('El texto ya no está en el estado que permite esta acción.');
}

async function assertConcept(
  tx: TenantTransaction,
  principal: Principal,
  fileId: string | null,
): Promise<void> {
  if (fileId === null || (await isAttachableFile(tx, principal, fileId))) return;
  throw webInvalid('El archivo del concepto jurídico no está disponible.');
}

async function audit(
  tx: TenantTransaction,
  actor: WebActor,
  row: Pick<LegalRow, 'id' | 'key' | 'versionNumber'>,
  step: 'create' | 'update' | 'approve' | 'publish',
): Promise<void> {
  const events = {
    create: 'created',
    update: 'updated',
    approve: 'approved',
    publish: 'published',
  } as const;
  await recordWebChange(tx, actor, {
    action: `web.legal_text.${step}`,
    event: `web.legal.${events[step]}`,
    entityType: 'web_legal_text',
    entityId: row.id,
    changes: { key: row.key, version_number: row.versionNumber },
  });
}

@Injectable()
export class LegalTexts {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal, key: LegalTextKey | undefined): Promise<LegalText[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.webLegalText.findMany({
        where: { deletedAt: null, ...(key === undefined ? {} : { key }) },
        orderBy: [{ key: 'asc' }, { versionNumber: 'desc' }],
        take: 300,
      });
      const refs = await userRefs(
        tx,
        rows.flatMap((row) => [row.draftedBy, row.approvedBy]),
      );
      return rows.map((row) => legalView(row, refs));
    });
  }

  /** Nueva versión en borrador; solo una en curso por clase de texto. */
  async create(principal: Principal, meta: RequestMeta, input: CreateLegalText): Promise<string> {
    const actor = webActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const open = await tx.webLegalText.count({
        where: { key: input.key, status: { in: ['draft', 'approved'] }, deletedAt: null },
      });
      if (open > 0) throw webConflict('Ya hay una versión en curso de este texto. Edítela.');
      const last = await tx.webLegalText.aggregate({
        where: { key: input.key },
        _max: { versionNumber: true },
      });
      const row = await tx.webLegalText.create({
        data: {
          tenantId: actor.tenantId,
          key: input.key,
          versionNumber: (last._max.versionNumber ?? 0) + 1,
          title: input.title,
          body: input.body,
          draftedBy: principal.userId,
        },
      });
      await audit(tx, actor, row, 'create');
      return row.id;
    });
  }

  /** Solo el borrador se edita; quien lo edita queda como su redactor. */
  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: UpdateLegalText,
  ): Promise<void> {
    const actor = webActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const { count } = await tx.webLegalText.updateMany({
        where: { id: target.id, version: target.version, status: 'draft', deletedAt: null },
        data: { title: input.title, body: input.body, draftedBy: principal.userId },
      });
      const row = await rowOf(tx, target.id);
      if (count !== 1) {
        if (row.status === 'draft') throw versionConflict();
        throw webConflict('Solo se edita un texto en borrador.');
      }
      await audit(tx, actor, row, 'update');
    });
  }

  async approve(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: ApproveLegalText,
  ): Promise<void> {
    const actor = webActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await rowOf(tx, target.id);
      if (row.draftedBy === principal.userId) throw selfApproval();
      await assertConcept(tx, principal, input.concept_file_id);
      await moveText(tx, target, 'draft', {
        status: 'approved',
        approvedBy: principal.userId,
        approvedAt: actor.at,
        conceptFileId: input.concept_file_id,
      });
      await audit(tx, actor, row, 'approve');
    });
  }

  /** Publica la versión aprobada; la publicada hasta hoy queda reemplazada. */
  async publish(principal: Principal, meta: RequestMeta, target: Target): Promise<void> {
    const actor = webActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await rowOf(tx, target.id);
      await tx.webLegalText.updateMany({
        where: { key: row.key, status: 'published', deletedAt: null },
        data: { status: 'replaced', replacedAt: actor.at },
      });
      await moveText(tx, target, 'approved', { status: 'published', effectiveFrom: actor.at });
      await audit(tx, actor, row, 'publish');
    });
  }
}
