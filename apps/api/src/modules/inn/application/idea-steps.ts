import { Inject, Injectable } from '@nestjs/common';
import {
  ARCHIVABLE_STAGES,
  VIABILITY_CONCEPTS,
  viabilityTotal,
  type IdeaDecision,
  type IdeaProgress,
  type InnRef,
  type SubmitViability,
} from '@arza/contracts';

import type { InnIdea, Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { recordSystemForm, VIABILITY_CODE, type SystemFormRecord } from '../../doc/index.js';
import {
  innActorOf,
  innConflict,
  innNotFound,
  recordInnChange,
  refOf,
  selfDecision,
  userRefs,
  type InnActor,
  type Target,
} from './inn-support.js';

// Pasos de una idea (B40, ficha 17.16): inscrita → en evaluación → aprobada → en desarrollo →
// implementada, o archivada. Quien la propuso no la evalúa ni la decide; aprobar exige la evaluación
// de viabilidad FT-INN-003 y un concepto distinto de «no viable» (decisión 3).

const NEXT_PROGRESS = { approved: 'in_development', in_development: 'implemented' } as const;

function formUnavailable(): never {
  throw innConflict(
    `La empresa no tiene publicado el formato ${VIABILITY_CODE}. Publíquelo en Documentos › Formatos.`,
  );
}

function viabilityFormData(
  idea: InnIdea,
  people: { readonly proposer: InnRef; readonly evaluator: InnRef },
  input: SubmitViability,
  today: string,
): Prisma.InputJsonObject {
  return {
    idea: `${idea.code} · ${idea.title}`,
    proponente: people.proposer.name,
    evaluador: people.evaluator.name,
    fecha: today,
    ...Object.fromEntries(Object.entries(input.scores).map(([key, score]) => [key, String(score)])),
    total: String(viabilityTotal(input.scores)),
    concepto: VIABILITY_CONCEPTS[input.concept],
    observaciones: input.observations ?? '',
  };
}

/** Llena el FT-INN-003 publicado con la evaluación; sin el formato publicado no se evalúa. */
async function fillViabilityForm(
  tx: TenantTransaction,
  actor: InnActor,
  evaluation: { readonly row: InnIdea; readonly input: SubmitViability; readonly today: string },
): Promise<SystemFormRecord> {
  const { row, input, today } = evaluation;
  const evaluatorId = actor.userId ?? '';
  const refs = await userRefs(tx, [row.proposerId, evaluatorId]);
  const people = { proposer: refOf(refs, row.proposerId), evaluator: refOf(refs, evaluatorId) };
  const record = await recordSystemForm(tx, actor, {
    templateCode: VIABILITY_CODE,
    entityType: 'inn_idea',
    entityId: row.id,
    data: viabilityFormData(row, people, input, today),
  });
  return record ?? formUnavailable();
}

@Injectable()
export class IdeaSteps {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** La idea vigente, con su versión; quien la propuso no puede decidir sobre ella. */
  private async decidable(tx: TenantTransaction, principal: Principal, id: string) {
    const row = await tx.innIdea.findFirst({ where: { id, deletedAt: null } });
    if (row === null) throw innNotFound('La idea no existe.');
    if (row.proposerId === principal.userId) throw selfDecision();
    return row;
  }

  private async save(
    tx: TenantTransaction,
    actor: InnActor,
    target: Target,
    change: {
      readonly row: InnIdea;
      readonly data: Prisma.InnIdeaUpdateManyMutationInput;
      readonly action: string;
      readonly event: string;
      readonly changes: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    const updated = await tx.innIdea.updateMany({
      where: { id: change.row.id, version: target.version },
      data: change.data,
    });
    if (updated.count !== 1) throw versionConflict();
    await recordInnChange(tx, actor, {
      action: change.action,
      event: change.event,
      entityType: 'inn_idea',
      entityId: change.row.id,
      changes: { code: change.row.code, ...change.changes },
    });
  }

  async startEvaluation(principal: Principal, meta: RequestMeta, target: Target): Promise<void> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await this.decidable(tx, principal, target.id);
      if (row.stage !== 'registered')
        throw innConflict('La idea ya está en evaluación o decidida.');
      await this.save(tx, actor, target, {
        row,
        data: { stage: 'evaluating', evaluatorId: principal.userId },
        action: 'inn.idea.evaluate',
        event: 'inn.idea.evaluating',
        changes: { stage: [row.stage, 'evaluating'] },
      });
    });
  }

  /** Diligencia el FT-INN-003; mientras siga en evaluación, una nueva evaluación reemplaza la anterior. */
  async submitViability(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SubmitViability,
  ): Promise<void> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await this.decidable(tx, principal, target.id);
      if (row.stage !== 'evaluating') throw innConflict('Primero inicie la evaluación de la idea.');
      const today = bogotaToday(actor.at);
      const record = await fillViabilityForm(tx, actor, { row, input, today });
      const total = viabilityTotal(input.scores);
      await this.save(tx, actor, target, {
        row,
        data: {
          viabilityScores: input.scores,
          viabilityTotal: total,
          viabilityConcept: input.concept,
          viabilityNote: input.observations,
          evaluatedBy: principal.userId,
          evaluatedOn: fromCalendarDate(today),
          viabilityRecordId: record.id,
          viabilityRecordCode: record.code,
        },
        action: 'inn.idea.viability',
        event: 'inn.idea.evaluated',
        changes: { total, concept: input.concept, record_code: record.code },
      });
    });
  }

  async decide(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: IdeaDecision,
  ): Promise<void> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await this.decidable(tx, principal, target.id);
      const approve = input.decision === 'approve';
      if (approve) assertApprovable(row);
      if (!approve && !(ARCHIVABLE_STAGES as readonly string[]).includes(row.stage)) {
        throw innConflict('La idea ya está implementada o archivada.');
      }
      const stage = approve ? 'approved' : 'archived';
      await this.save(tx, actor, target, {
        row,
        data: {
          stage,
          decisionNote: input.note,
          decidedBy: principal.userId,
          decidedOn: fromCalendarDate(bogotaToday(actor.at)),
        },
        action: approve ? 'inn.idea.approve' : 'inn.idea.archive',
        event: approve ? 'inn.idea.approved' : 'inn.idea.archived',
        changes: { stage: [row.stage, stage], note: input.note },
      });
    });
  }

  /** Aprobada → en desarrollo → implementada. */
  async progress(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: IdeaProgress,
  ): Promise<void> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await tx.innIdea.findFirst({ where: { id: target.id, deletedAt: null } });
      if (row === null) throw innNotFound('La idea no existe.');
      const next = NEXT_PROGRESS[row.stage as keyof typeof NEXT_PROGRESS] as string | undefined;
      if (next !== input.stage) {
        throw innConflict('La idea no puede pasar a ese estado desde el estado en que está.');
      }
      await this.save(tx, actor, target, {
        row,
        data: { stage: input.stage },
        action: 'inn.idea.progress',
        event: 'inn.idea.progressed',
        changes: { stage: [row.stage, input.stage], note: input.note },
      });
    });
  }
}

function assertApprovable(row: InnIdea): void {
  if (row.stage !== 'evaluating') throw innConflict('Solo se aprueba una idea en evaluación.');
  if (row.viabilityTotal === null) {
    throw innConflict('Diligencie la evaluación de viabilidad antes de aprobar la idea.');
  }
  if (row.viabilityConcept === 'not_viable') {
    throw innConflict('La evaluación concluyó que la idea no es viable: archívela.');
  }
}
