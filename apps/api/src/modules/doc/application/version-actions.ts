import { Inject, Injectable } from '@nestjs/common';
import {
  versionStatusSchema,
  type ObsoleteVersionRequest,
  type PublishVersionRequest,
  type RejectVersionRequest,
} from '@arza/contracts';

import type { DocDocument, DocVersion } from '../../../generated/prisma/client.js';
import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import {
  decideAsParticipant,
  participationOf,
  requestTransition,
  type TaskActor,
} from '../../wf/index.js';
import { allowedActions, VERSION_TRANSITIONS, type VersionStep } from '../domain/document-rules.js';
import { executeChangeRequest, usableChangeRequest } from './change-request-rows.js';
import { selfApproval, transitionNotAllowed } from './doc-messages.js';
import { actorOf, lockDocument, readerOf, type DocActor, type DocReader } from './doc-support.js';
import { startVersionFlow } from './version-flow.js';
import { auditStep, moveVersion } from './version-steps.js';
import { findVisibleVersion } from './versions.js';

// Pasos de una versión desde su ficha (B18, ficha 17.4; desde B19 con su trámite). Enviar,
// devolver, aprobar y publicar son pasos del trámite en el motor de flujos: la versión los sigue en
// la misma transacción (version-flow.ts), igual que cuando se dan desde «Mis tareas». Declarar
// obsoleto un documento del SGC exige una Solicitud de Acción Documental de eliminación aprobada.

export interface StepTarget {
  readonly id: string;
  readonly version: number;
}

interface Step {
  readonly tx: TenantTransaction;
  readonly actor: DocActor;
  readonly reader: DocReader;
  readonly taskActor: TaskActor;
  readonly ability: AppAbility;
  readonly document: DocDocument;
  readonly version: DocVersion;
}

async function assertStep(step: Step, name: VersionStep): Promise<void> {
  const { version, reader } = step;
  const isAuthor = version.createdBy === reader.userId;
  const instanceId = version.workflowInstanceId;
  const participation =
    instanceId === null ? null : await participationOf(step.tx, instanceId, step.taskActor);
  const state = {
    status: versionStatusSchema.parse(version.status),
    pdfReady: version.renderStatus === 'ready',
    step: participation?.stateKey ?? null,
  };
  const actor = {
    ...reader,
    isAuthor,
    attendsApproval: participation?.attendsApproval ?? false,
    attendsAction: participation?.attendsAction ?? false,
  };
  if (allowedActions(state, actor).includes(name)) return;
  const reviews = name === 'approve' || name === 'reject';
  if (reviews && isAuthor && version.status === VERSION_TRANSITIONS[name].from)
    throw selfApproval();
  throw transitionNotAllowed();
}

/** Mueve el trámite con una acción de un estado normal (enviar o publicar). */
async function transition(step: Step, action: string, facts: Record<string, string> = {}) {
  const instanceId = step.version.workflowInstanceId ?? (await ensureFlow(step));
  await requestTransition(step.tx, step.actor, {
    instanceId,
    action,
    comment: null,
    facts,
    actor: step.taskActor,
    hasPermission: (code) => hasPermission(step.ability, code),
  });
}

/** Una versión elaborada antes de B19 no tiene trámite: lo recibe al enviarse. */
async function ensureFlow(step: Step): Promise<string> {
  const target = { version: step.version, code: step.document.code };
  return startVersionFlow(step.tx, step.actor, target);
}

async function decide(step: Step, decision: 'approved' | 'rejected', comment: string | null) {
  await decideAsParticipant(step.tx, step.actor, {
    instanceId: step.version.workflowInstanceId ?? '',
    actor: step.taskActor,
    decision,
    comment,
  });
}

@Injectable()
export class VersionActionsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async submit(
    principal: Principal,
    ability: AppAbility,
    target: StepTarget,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run({ principal, ability, meta }, target, 'submit', (step) =>
      transition(step, 'submit'),
    );
  }

  async reject(
    principal: Principal,
    ability: AppAbility,
    target: StepTarget,
    input: RejectVersionRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run({ principal, ability, meta }, target, 'reject', (step) =>
      decide(step, 'rejected', input.note),
    );
  }

  async approve(
    principal: Principal,
    ability: AppAbility,
    target: StepTarget,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run({ principal, ability, meta }, target, 'approve', (step) =>
      decide(step, 'approved', null),
    );
  }

  async publish(
    principal: Principal,
    ability: AppAbility,
    target: StepTarget,
    input: PublishVersionRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const facts =
      input.effective_date === undefined ? {} : { effective_date: input.effective_date };
    await this.run({ principal, ability, meta }, target, 'publish', (step) =>
      transition(step, 'publish', facts),
    );
  }

  /** El documento deja de regir: su vigente pasa a obsoleta y ya no la descargan los usuarios. */
  async obsolete(
    principal: Principal,
    ability: AppAbility,
    target: StepTarget,
    input: ObsoleteVersionRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run({ principal, ability, meta }, target, 'obsolete', async (step) => {
      const { tx, actor, document } = step;
      const request = document.isControlled
        ? await usableChangeRequest(tx, input.change_request_id, {
            action: 'obsolete',
            documentId: document.id,
          })
        : null;
      await moveVersion(step, 'obsolete', { obsoletedAt: actor.at });
      await tx.docDocument.update({ where: { id: document.id }, data: { status: 'obsolete' } });
      await auditStep(step, 'obsolete', {
        reason: input.reason,
        change_request: request?.code ?? null,
      });
      if (request !== null) await executeChangeRequest(tx, actor, request.id);
    });
  }

  /** Revisa el permiso, el paso y la versión vista, con el documento bloqueado, y da el paso. */
  private async run(
    request: { principal: Principal; ability: AppAbility; meta: RequestMeta },
    target: StepTarget,
    name: VersionStep,
    apply: (step: Step) => Promise<void>,
  ): Promise<void> {
    const { principal, ability, meta } = request;
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const found = await findVisibleVersion(tx, reader, target.id);
      const taskActor = await reader.taskActor(actor.at);
      await lockDocument(tx, actor.tenantId, found.document.id);
      const version = await tx.docVersion.findUniqueOrThrow({ where: { id: target.id } });
      if (version.version !== target.version) throw versionConflict();
      const step = { tx, actor, reader, taskActor, ability, document: found.document, version };
      await assertStep(step, name);
      await apply(step);
    });
  }
}
