import { Inject, Injectable } from '@nestjs/common';
import {
  legalPeriodStart,
  type EvaluateLegalRequirement,
  type QmsCreatedResponse,
} from '@arza/contracts';

import type { QmsLegalRequirement } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate } from '../../core/index.js';
import { assertPlan, insertAction, NO_LINK } from './action-records.js';
import {
  assertFile,
  auditQms,
  qmsActorOf,
  qmsInvalid,
  qmsNotFound,
  type QmsActor,
} from './qms-support.js';

// Evaluación del cumplimiento legal (B46, decisión 7; PR-DG-001). Cada evaluación queda fija y la
// más reciente es la que muestra el normograma. Un resultado parcial o negativo abre, en la misma
// transacción, la acción de mejora con su responsable y su fecha compromiso.

async function requirementOf(tx: TenantTransaction, id: string): Promise<QmsLegalRequirement> {
  const row = await tx.qmsLegalRequirement.findFirst({ where: { id, deletedAt: null } });
  if (row === null) throw qmsNotFound('El requisito no existe.');
  return row;
}

async function openAction(
  tx: TenantTransaction,
  actor: QmsActor,
  requirement: QmsLegalRequirement,
  input: EvaluateLegalRequirement,
): Promise<string | null> {
  if (input.action === null) return null;
  await assertPlan(tx, actor, input.action);
  const action = await insertAction(tx, actor, {
    originType: 'legal_evaluation',
    link: { ...NO_LINK, legalRequirementId: requirement.id, processId: requirement.processId },
    description: input.action.description,
    responsibleId: input.action.responsible_id,
    dueOn: input.action.due_on,
    notes: null,
  });
  return action.id;
}

interface EvaluationFacts {
  readonly requirement: QmsLegalRequirement;
  readonly actionId: string | null;
  readonly evaluatedBy: string;
}

async function insertEvaluation(
  tx: TenantTransaction,
  actor: QmsActor,
  facts: EvaluationFacts,
  input: EvaluateLegalRequirement,
): Promise<string> {
  const row = await tx.qmsLegalEvaluation.create({
    data: {
      tenantId: actor.tenantId,
      requirementId: facts.requirement.id,
      periodStart: fromCalendarDate(legalPeriodStart(input.evaluated_on)),
      evaluatedOn: fromCalendarDate(input.evaluated_on),
      result: input.result,
      evidenceNote: input.evidence_note,
      evidenceFileId: input.evidence_file_id,
      actionId: facts.actionId,
      evaluatedBy: facts.evaluatedBy,
    },
  });
  await auditQms(tx, actor, {
    action: 'qms.legal_requirement.evaluate',
    entityType: 'qms_legal_evaluation',
    entityId: row.id,
    changes: {
      requirement: facts.requirement.code,
      result: input.result,
      evaluated_on: input.evaluated_on,
      action_id: facts.actionId,
    },
  });
  return row.id;
}

@Injectable()
export class LegalEvaluations {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async evaluate(
    principal: Principal,
    meta: RequestMeta,
    requirementId: string,
    input: EvaluateLegalRequirement,
  ): Promise<QmsCreatedResponse> {
    const actor = qmsActorOf(principal, this.clock.now(), meta);
    if (input.evaluated_on > bogotaToday(actor.at)) {
      throw qmsInvalid('La fecha de la evaluación no puede estar en el futuro.');
    }
    return this.database.withTenant(principal, async (tx) => {
      const requirement = await requirementOf(tx, requirementId);
      await assertFile(tx, principal, input.evidence_file_id);
      const actionId = await openAction(tx, actor, requirement, input);
      const facts = { requirement, actionId, evaluatedBy: principal.userId };
      return { id: await insertEvaluation(tx, actor, facts, input) };
    });
  }
}
