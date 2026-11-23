import { Inject, Injectable } from '@nestjs/common';
import {
  canPrivacyRequestStep,
  PRIVACY_TERMS,
  privacyRequestKindSchema,
  privacyRequestStatusSchema,
  type PrivacyExtension,
  type PrivacyRequestAction,
  type PrivacyRequirement,
  type PrivacyRequirementAnswer,
  type PrivacyResponse,
  type VerifyPrivacyRequest,
} from '@arza/contracts';

import type { PrivacyRequest } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  bogotaToday,
  businessDeadline,
  fromCalendarDate,
  toCalendarDate,
} from '../../core/index.js';
import { closeWorkflowAsOwner, rescheduleWorkflow } from '../../wf/index.js';
import { REQUEST_FLOW_DONE } from '../domain/privacy-flows.js';
import { PARTY_DIRECTORY, type PartyDirectory } from './party-directory.js';
import { actorOf, type PrivacyActor } from './privacy-support.js';
import { legalDueOn, taskDueAt } from './request-intake.js';
import { requestDateInvalid, requestStepInvalid } from './request-messages.js';
import { changeRequest, lockRequest, type RequestChange } from './request-records.js';

// Recorrido de una solicitud de titular (B42, ficha 17.19; decisiones 3 y 4): verificar la
// identidad, pedir que complete el reclamo (el plazo se suspende), ampliar el plazo una vez,
// responder y cerrar. La tarea del Oficial se mueve con la fecha límite y se cierra con la solicitud.

const STEP_MESSAGES: Record<PrivacyRequestAction, string> = {
  start_verification: 'La verificación de identidad ya empezó o la solicitud ya avanzó.',
  verify: 'La identidad de esta solicitud ya se verificó.',
  require: 'En este estado ya no se puede pedir que completen el reclamo.',
  answer_requirement: 'En este estado no se puede registrar lo que completó el titular.',
  extend: 'En este estado ya no se puede ampliar el plazo.',
  export: 'Los datos se entregan mientras la solicitud está en trámite.',
  erase: 'La supresión se hace mientras la solicitud está en trámite.',
  respond: 'Solo se responde una solicitud en trámite, con la identidad verificada.',
  close: 'Solo se cierra una solicitud respondida.',
};

export function assertRequestStep(row: PrivacyRequest, action: PrivacyRequestAction): void {
  if (!canPrivacyRequestStep(action, privacyRequestStatusSchema.parse(row.status))) {
    throw requestStepInvalid(STEP_MESSAGES[action]);
  }
}

function receivedOn(row: PrivacyRequest): string {
  return bogotaToday(row.receivedAt);
}

function paused(row: PrivacyRequest): boolean {
  return row.requirementSentAt !== null && row.requirementAnsweredAt === null;
}

/** Mueve la fecha de la tarea del Oficial; sin fecha mientras el plazo está suspendido. */
async function moveTask(tx: TenantTransaction, actor: PrivacyActor, row: PrivacyRequest) {
  if (row.workflowInstanceId === null) return;
  const dueAt = row.dueOn === null ? null : taskDueAt(toCalendarDate(row.dueOn));
  await rescheduleWorkflow(tx, actor, { instanceId: row.workflowInstanceId, dueAt });
}

/** Cierra la tarea del Oficial junto con la solicitud. */
export async function closeRequestTask(
  tx: TenantTransaction,
  actor: PrivacyActor,
  row: PrivacyRequest,
): Promise<void> {
  if (row.workflowInstanceId === null) return;
  await closeWorkflowAsOwner(tx, actor, {
    instanceId: row.workflowInstanceId,
    action: REQUEST_FLOW_DONE,
    comment: null,
  });
}

/** Último día para pedir que complete el reclamo: 5 días hábiles después de recibirlo. */
export async function requirementOpenUntil(
  tx: TenantTransaction,
  row: PrivacyRequest,
): Promise<string | null> {
  if (row.kind !== 'claim') return null;
  return businessDeadline(tx, receivedOn(row), PRIVACY_TERMS.requirementBusinessDays);
}

function assertPastDate(row: PrivacyRequest, date: string, at: Date): void {
  if (date > bogotaToday(at) || date < receivedOn(row)) throw requestDateInvalid();
}

@Injectable()
export class RequestStepsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(PARTY_DIRECTORY) private readonly parties: PartyDirectory,
  ) {}

  async startVerification(
    principal: Principal,
    id: string,
    version: number,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, id, async (tx, actor, row) => {
      assertRequestStep(row, 'start_verification');
      return this.apply(tx, actor, row, version, {
        action: 'privacy.request.verification_start',
        data: { status: 'verifying' },
        changes: { status: [row.status, 'verifying'] },
        event: { kind: 'verification_started', note: null, mail: false },
      });
    });
  }

  async verify(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: VerifyPrivacyRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target.id, async (tx, actor, row) => {
      assertRequestStep(row, 'verify');
      const party = (await this.parties.describe(tx, [input.party_id])).get(input.party_id);
      if (party?.kind !== 'person' || !party.isCurrent) {
        throw requestStepInvalid('Relacione la solicitud con una persona vigente en Terceros.');
      }
      return this.apply(tx, actor, row, target.version, {
        action: 'privacy.request.verify',
        data: {
          status: 'in_progress',
          partyId: input.party_id,
          verificationMethod: input.method,
          verificationNote: input.note,
          verifiedAt: actor.at,
          verifiedBy: actor.userId,
        },
        changes: {
          status: [row.status, 'in_progress'],
          party_id: input.party_id,
          method: input.method,
        },
        event: { kind: 'verified', note: input.note, mail: false },
      });
    });
  }

  /** Pide que complete el reclamo: el plazo queda suspendido hasta que lo haga (decisión 4). */
  async require(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: PrivacyRequirement,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target.id, async (tx, actor, row) => {
      assertRequestStep(row, 'require');
      const until = await requirementOpenUntil(tx, row);
      if (until === null)
        throw requestStepInvalid('Solo a un reclamo se le pide completar información.');
      if (row.requirementSentAt !== null)
        throw requestStepInvalid('Ya se pidió completar este reclamo.');
      if (bogotaToday(actor.at) > until) {
        throw requestStepInvalid('Pasaron los 5 días hábiles para pedir que complete el reclamo.');
      }
      const after = await this.apply(tx, actor, row, target.version, {
        action: 'privacy.request.require',
        data: { requirementText: input.text, requirementSentAt: actor.at, dueOn: null },
        changes: { due_on: [toCalendarDate(row.dueOn ?? actor.at), null] },
        event: { kind: 'requirement', note: input.text, mail: true },
      });
      await moveTask(tx, actor, after);
      return after;
    });
  }

  /** El titular completó el reclamo: el plazo vuelve a correr desde ese día. */
  async answerRequirement(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: PrivacyRequirementAnswer,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target.id, async (tx, actor, row) => {
      assertRequestStep(row, 'answer_requirement');
      if (!paused(row)) throw requestStepInvalid('Este reclamo no está esperando información.');
      assertPastDate(row, input.answered_on, actor.at);
      const kind = privacyRequestKindSchema.parse(row.kind);
      const dueOn = await legalDueOn(tx, input.answered_on, kind, row.extendedAt !== null);
      const after = await this.apply(tx, actor, row, target.version, {
        action: 'privacy.request.requirement_answer',
        data: { requirementAnsweredAt: actor.at, dueOn: fromCalendarDate(dueOn) },
        changes: { due_on: [null, dueOn], answered_on: input.answered_on },
        event: { kind: 'requirement_answered', note: input.note, mail: false },
      });
      await moveTask(tx, actor, after);
      return after;
    });
  }

  /** Amplía el plazo una sola vez, antes de que venza, y se le informa al titular. */
  async extend(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: PrivacyExtension,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target.id, async (tx, actor, row) => {
      assertRequestStep(row, 'extend');
      if (row.extendedAt !== null) throw requestStepInvalid('El plazo ya se amplió una vez.');
      if (row.dueOn === null) throw requestStepInvalid('El plazo está suspendido.');
      const current = toCalendarDate(row.dueOn);
      if (bogotaToday(actor.at) > current) {
        throw requestStepInvalid(
          'El plazo ya venció; la ampliación se pide antes del vencimiento.',
        );
      }
      const kind = privacyRequestKindSchema.parse(row.kind);
      const dueOn = await businessDeadline(tx, current, PRIVACY_TERMS[kind].extension);
      const after = await this.apply(tx, actor, row, target.version, {
        action: 'privacy.request.extend',
        data: {
          extendedAt: actor.at,
          extensionReason: input.reason,
          dueOn: fromCalendarDate(dueOn),
        },
        changes: { due_on: [current, dueOn], reason: input.reason },
        event: { kind: 'extended', note: input.reason, mail: true },
      });
      await moveTask(tx, actor, after);
      return after;
    });
  }

  async respond(
    principal: Principal,
    target: { readonly id: string; readonly version: number },
    input: PrivacyResponse,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target.id, async (tx, actor, row) => {
      assertRequestStep(row, 'respond');
      if (paused(row)) throw requestStepInvalid('El reclamo espera que el titular lo complete.');
      return this.apply(tx, actor, row, target.version, {
        action: 'privacy.request.respond',
        data: {
          status: 'responded',
          response: input.response,
          respondedAt: actor.at,
          respondedBy: actor.userId,
        },
        changes: { status: [row.status, 'responded'] },
        event: { kind: 'responded', note: null, mail: true },
      });
    });
  }

  async close(principal: Principal, id: string, version: number, meta: RequestMeta): Promise<void> {
    await this.run(principal, meta, id, async (tx, actor, row) => {
      assertRequestStep(row, 'close');
      const after = await this.apply(tx, actor, row, version, {
        action: 'privacy.request.close',
        data: { status: 'closed', closure: 'answered', closedAt: actor.at },
        changes: { status: [row.status, 'closed'], closure: 'answered' },
        event: { kind: 'closed', note: null, mail: false },
      });
      await closeRequestTask(tx, actor, after);
      return after;
    });
  }

  private async apply(
    tx: TenantTransaction,
    actor: PrivacyActor,
    row: PrivacyRequest,
    version: number,
    change: RequestChange,
  ): Promise<PrivacyRequest> {
    return changeRequest(tx, actor, row, version, change);
  }

  private async run(
    principal: Principal,
    meta: RequestMeta,
    id: string,
    step: (
      tx: TenantTransaction,
      actor: PrivacyActor,
      row: PrivacyRequest,
    ) => Promise<PrivacyRequest>,
  ): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      await step(tx, actor, await lockRequest(tx, id));
    });
  }
}
