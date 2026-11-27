import { Inject, Injectable } from '@nestjs/common';
import {
  aiSourceKindSchema,
  type AiRequestListQuery,
  type AiRequestListResponse,
  type AiRequestRow,
  type AiReview,
  type AiStatus,
  type AiUseCase,
} from '@arza/contracts';
import { z } from 'zod';

import type { AiRequest } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { addDays, bogotaStartOf } from '../../core/index.js';
import { aiActorOf, aiNotFound, recordAiChange, refOf, userRefs } from './ai-support.js';
import { AiGateway } from './gateway.js';

// Registro de usos del asistente (B47, decisión 5): quién, qué uso, qué modelo, qué clase de datos
// salió, cuánto, con qué resultado, qué citó y si la persona usó la propuesta. Lo consultan el
// Oficial de datos, el auditor y el administrador; la consulta también queda auditada.

const sourcesSchema = z.array(z.object({ kind: aiSourceKindSchema, id: z.uuid() }));

function rowView(row: AiRequest, refs: Awaited<ReturnType<typeof userRefs>>): AiRequestRow {
  const kind = aiSourceKindSchema.safeParse(row.targetKind);
  return {
    id: row.id,
    created_at: row.createdAt.toISOString(),
    user: refOf(refs, row.userId),
    use_case: row.useCase as AiRequestRow['use_case'],
    provider: row.provider as AiRequestRow['provider'],
    model: row.model,
    prompt_version: row.promptVersion,
    input_class: row.inputClass as AiRequestRow['input_class'],
    input_chars: row.inputChars,
    output_chars: row.outputChars,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    redactions: row.redactions,
    outcome: row.outcome as AiRequestRow['outcome'],
    target: kind.success && row.targetId !== null ? { kind: kind.data, id: row.targetId } : null,
    sources: sourcesSchema.catch([]).parse(row.sources),
    review: row.review as AiRequestRow['review'],
    reviewed_at: row.reviewedAt?.toISOString() ?? null,
  };
}

function createdBetween(query: AiRequestListQuery) {
  return {
    ...(query.from === undefined ? {} : { gte: bogotaStartOf(query.from) }),
    ...(query.to === undefined ? {} : { lt: bogotaStartOf(addDays(query.to, 1)) }),
  };
}

@Injectable()
export class AiUsage {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AiGateway) private readonly gateway: AiGateway,
  ) {}

  /** Qué puede hacer hoy la persona con el asistente. */
  async status(principal: Principal): Promise<AiStatus> {
    const model = this.gateway.modelInUse;
    return this.database.withTenant(principal, async (tx) => {
      const enabled = await tx.aiUseCase.findMany({
        where: { enabled: true, deletedAt: null },
        select: { useCase: true },
        orderBy: { useCase: 'asc' },
      });
      return {
        provider: model?.provider ?? 'off',
        model: model?.model ?? null,
        enabled_use_cases: model === null ? [] : enabled.map((row) => row.useCase as AiUseCase),
        used_today: await this.gateway.usedToday(tx, principal.userId),
        daily_limit: this.gateway.dailyLimit,
      };
    });
  }

  /** La persona dice si usó la propuesta; solo sobre sus propios usos y una sola vez. */
  async review(
    principal: Principal,
    meta: RequestMeta,
    id: string,
    decision: AiReview,
  ): Promise<void> {
    const actor = aiActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const request = await tx.aiRequest.findFirst({
        where: { id, userId: principal.userId, outcome: 'answered' },
        select: { id: true, review: true, useCase: true },
      });
      if (request === null) throw aiNotFound('El uso no existe o no es suyo.');
      if (request.review !== null) throw versionConflict();
      await tx.aiRequest.update({
        where: { id },
        data: { review: decision, reviewedAt: actor.at },
      });
      await recordAiChange(tx, actor, {
        action: 'ai.request.review',
        event: 'ai.request.reviewed',
        entityType: 'ai_request',
        entityId: id,
        changes: { use_case: request.useCase, review: decision },
      });
    });
  }

  /** Registro de usos, del más reciente al más antiguo. La consulta queda en la auditoría. */
  async list(
    principal: Principal,
    meta: RequestMeta,
    query: AiRequestListQuery,
  ): Promise<AiRequestListResponse> {
    const actor = aiActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.aiRequest.findMany({
        where: {
          ...(query.use_case === undefined ? {} : { useCase: query.use_case }),
          ...(query.outcome === undefined ? {} : { outcome: query.outcome }),
          createdAt: createdBetween(query),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
      });
      const page = rows.slice(0, query.limit);
      const refs = await userRefs(
        tx,
        page.map((row) => row.userId),
      );
      // Consultar el registro también queda auditado (ficha 17.20); es una lectura: sin evento.
      await recordAuditEvent(tx, {
        tenantId: actor.tenantId,
        occurredAt: actor.at,
        actor: { kind: 'user', id: principal.userId },
        action: 'ai.request.read',
        entityType: 'ai_request',
        entityId: principal.tenantId,
        result: 'success',
        changes: { rows: page.length },
        meta,
      });
      return {
        data: page.map((row) => rowView(row, refs)),
        next_cursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }
}
