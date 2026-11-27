import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  AI_ERROR_CODES,
  AI_USE_CASES,
  type AiPromptListResponse,
  type AiUseCase,
  type AiUseCaseSetting,
  type CreateAiPrompt,
  type SaveAiUseCase,
} from '@arza/contracts';

import type { AiPrompt as AiPromptRow } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { AppError } from '../../../platform/errors/app-error.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { DEFAULT_PROMPTS } from '../domain/default-prompts.js';
import { aiActorOf, aiNotFound, recordAiChange, refOf, userRefs } from './ai-support.js';

// Gobierno del asistente (B47): el Oficial de datos activa cada uso tras registrar su evaluación
// de impacto (decisión 7) y las instrucciones se versionan y las aprueba una persona distinta de
// quien las escribió. Todo cambio queda en la auditoría.

const USE_CASES = Object.keys(AI_USE_CASES) as AiUseCase[];

function selfApproval(): AppError {
  return new AppError(
    HttpStatus.FORBIDDEN,
    AI_ERROR_CODES.selfApproval,
    'Una instrucción la aprueba una persona distinta de quien la escribió.',
  );
}

function promptView(row: AiPromptRow, refs: Awaited<ReturnType<typeof userRefs>>) {
  return {
    id: row.id,
    use_case: row.useCase as AiUseCase,
    version: row.promptVersion,
    body: row.body,
    status: row.status as 'draft' | 'approved' | 'retired',
    created_by: refOf(refs, row.createdBy),
    created_at: row.createdAt.toISOString(),
    approved_by: refOf(refs, row.approvedBy),
    approved_at: row.approvedAt?.toISOString() ?? null,
  };
}

function dateOrNull(value: Date | null): string | null {
  return value === null ? null : toCalendarDate(value);
}

@Injectable()
export class AiGovernance {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Cada uso, activo o no, con su evaluación de impacto. */
  async useCases(principal: Principal): Promise<AiUseCaseSetting[]> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.aiUseCase.findMany({ where: { deletedAt: null } });
      const refs = await userRefs(
        tx,
        rows.map((row) => row.updatedBy),
      );
      const byKey = new Map(rows.map((row) => [row.useCase, row]));
      return USE_CASES.map((key) => {
        const row = byKey.get(key);
        return {
          use_case: key,
          enabled: row?.enabled ?? false,
          assessment_reference: row?.assessmentReference ?? null,
          assessment_approved_on: dateOrNull(row?.assessmentApprovedOn ?? null),
          changed_by: refOf(refs, row?.updatedBy ?? null),
          changed_at: row?.updatedAt.toISOString() ?? null,
          version: row?.version ?? 0,
        };
      });
    });
  }

  /** Activa o apaga un uso (decisión 7). La versión 0 crea la configuración. */
  async saveUseCase(
    principal: Principal,
    meta: RequestMeta,
    useCase: AiUseCase,
    input: SaveAiUseCase,
  ): Promise<void> {
    const actor = aiActorOf(principal, this.clock.now(), meta);
    const data = {
      enabled: input.enabled,
      assessmentReference: input.assessment_reference,
      assessmentApprovedOn:
        input.assessment_approved_on === null
          ? null
          : fromCalendarDate(input.assessment_approved_on),
    };
    await this.database.withTenant(principal, async (tx) => {
      const existing = await tx.aiUseCase.findFirst({ where: { useCase } });
      if ((existing?.version ?? 0) !== input.version) throw versionConflict();
      const row =
        existing === null
          ? await tx.aiUseCase.create({ data: { tenantId: actor.tenantId, useCase, ...data } })
          : await tx.aiUseCase.update({ where: { id: existing.id }, data });
      await recordAiChange(tx, actor, {
        action: 'ai.use_case.update',
        event: 'ai.usecase.changed',
        entityType: 'ai_use_case',
        entityId: row.id,
        changes: {
          use_case: useCase,
          enabled: input.enabled,
          assessment_reference: input.assessment_reference,
          assessment_approved_on: input.assessment_approved_on,
        },
      });
    });
  }

  /** Las instrucciones de todos los usos y la de fábrica de cada uno. */
  async prompts(principal: Principal): Promise<AiPromptListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.aiPrompt.findMany({
        where: { deletedAt: null },
        orderBy: [{ useCase: 'asc' }, { promptVersion: 'desc' }],
        take: 500,
      });
      const refs = await userRefs(
        tx,
        rows.flatMap((row) => [row.createdBy, row.approvedBy]),
      );
      return {
        data: rows.map((row) => promptView(row, refs)),
        defaults: USE_CASES.map((key) => ({ use_case: key, body: DEFAULT_PROMPTS[key] })),
      };
    });
  }

  /** Nueva versión en borrador de la instrucción de un uso. */
  async createPrompt(
    principal: Principal,
    meta: RequestMeta,
    input: CreateAiPrompt,
  ): Promise<string> {
    const actor = aiActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const last = await tx.aiPrompt.findFirst({
        where: { useCase: input.use_case },
        orderBy: { promptVersion: 'desc' },
        select: { promptVersion: true },
      });
      const row = await tx.aiPrompt.create({
        data: {
          tenantId: actor.tenantId,
          useCase: input.use_case,
          promptVersion: (last?.promptVersion ?? 0) + 1,
          body: input.body,
        },
      });
      await recordAiChange(tx, actor, {
        action: 'ai.prompt.create',
        event: 'ai.prompt.created',
        entityType: 'ai_prompt',
        entityId: row.id,
        changes: { use_case: input.use_case, version: row.promptVersion },
      });
      return row.id;
    });
  }

  /** Aprueba un borrador: pasa a regir y la aprobada anterior queda reemplazada. */
  async approvePrompt(principal: Principal, meta: RequestMeta, id: string): Promise<void> {
    const actor = aiActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const draft = await tx.aiPrompt.findFirst({ where: { id, deletedAt: null } });
      if (draft === null) throw aiNotFound('La instrucción no existe.');
      if (draft.status !== 'draft') throw versionConflict();
      if (draft.createdBy === principal.userId) throw selfApproval();
      await tx.aiPrompt.updateMany({
        where: { useCase: draft.useCase, status: 'approved' },
        data: { status: 'retired' },
      });
      await tx.aiPrompt.update({
        where: { id },
        data: { status: 'approved', approvedBy: principal.userId, approvedAt: actor.at },
      });
      await recordAiChange(tx, actor, {
        action: 'ai.prompt.approve',
        event: 'ai.prompt.approved',
        entityType: 'ai_prompt',
        entityId: id,
        changes: { use_case: draft.useCase, version: draft.promptVersion },
      });
    });
  }
}
