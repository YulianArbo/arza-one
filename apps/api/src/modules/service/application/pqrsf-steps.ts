import { Inject, Injectable } from '@nestjs/common';
import {
  canPqrsfStep,
  NONCONFORMITY_TYPES,
  PQRSF_TYPES,
  PQRSF_STATUSES,
  pqrsfStatusSchema,
  pqrsfTypeSchema,
  type AssignPqrsfRequest,
  type ClassifyPqrsfRequest,
  type DraftPqrsfRequest,
  type PqrsfAction,
  type ReturnPqrsfRequest,
} from '@arza/contracts';

import type { Prisma, SvcPqrsf } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { openNonconformityFromPqrsf } from '../../qms/index.js';
import { findPqrsf, pqrsfAudit, pqrsfDeadline, pqrsfPayload } from './pqrsf-records.js';
import { transferToPrivacy } from './pqrsf-transfer.js';
import {
  approverInvalid,
  assigneeInvalid,
  recordServiceChange,
  responseInvalid,
  serviceActorOf,
  statusInvalid,
  type ServiceActor,
  type ServiceTarget,
} from './service-support.js';
import { assignablePeople } from './ticket-flow.js';
import { usableParty } from './ticket-links.js';

// El recorrido de la PQRSF (B29, ficha 17.9): clasificar (tipo, datos personales, tercero y
// responsable), reasignar, redactar la respuesta, enviarla a aprobación, aprobarla o devolverla y
// cerrarla. La respuesta la aprueba alguien distinto de quien la redactó (decisión 7); al aprobarla
// sale por correo. Clasificarla como de datos personales la traslada a Privacidad (decisión 5) y una
// queja o un reclamo procedente pide la no conformidad a Calidad (decisión 6).

interface Step {
  readonly action: PqrsfAction;
  readonly data: Prisma.SvcPqrsfUpdateManyMutationInput;
  readonly changes?: Record<string, Prisma.InputJsonValue | null>;
  /** Evento de la bandeja de salida, en pasado: «service.pqrsf.<event>». */
  readonly event: string;
}

/** El estado admite el paso; si no, lo dice con el nombre del estado. */
function assertStep(pqrsf: SvcPqrsf, action: PqrsfAction): void {
  const status = pqrsfStatusSchema.parse(pqrsf.status);
  if (!canPqrsfStep(action, status)) {
    throw statusInvalid(`Una PQRSF «${PQRSF_STATUSES[status]}» no admite ese paso.`);
  }
}

async function applyPqrsfStep(
  tx: TenantTransaction,
  actor: ServiceActor,
  pqrsf: SvcPqrsf,
  version: number,
  step: Step,
): Promise<SvcPqrsf> {
  assertStep(pqrsf, step.action);
  const { count } = await tx.svcPqrsf.updateMany({
    where: { id: pqrsf.id, version, status: pqrsf.status, deletedAt: null },
    data: step.data,
  });
  if (count === 0) throw versionConflict();
  const after = await tx.svcPqrsf.findUniqueOrThrow({ where: { id: pqrsf.id } });
  await recordServiceChange(tx, actor, {
    action: `service.pqrsf.${step.action}`,
    event: `service.pqrsf.${step.event}`,
    entityType: 'svc_pqrsf',
    entityId: pqrsf.id,
    changes: {
      ...pqrsfAudit(after),
      status: [pqrsf.status, after.status],
      ...(step.changes ?? {}),
    },
    payload: pqrsfPayload(after),
  });
  return after;
}

/** Un traslado o una solicitud a otro módulo: su propio rastro y su propio evento. */
async function handOff(
  tx: TenantTransaction,
  actor: ServiceActor,
  pqrsf: SvcPqrsf,
  kind: 'transfer' | 'nonconformity',
): Promise<void> {
  await recordServiceChange(tx, actor, {
    action: kind === 'transfer' ? 'service.pqrsf.transfer' : 'service.pqrsf.request_nonconformity',
    event: kind === 'transfer' ? 'service.pqrsf.transferred' : 'service.pqrsf.nonconforming',
    entityType: 'svc_pqrsf',
    entityId: pqrsf.id,
    changes: pqrsfAudit(pqrsf),
    payload: pqrsfPayload(pqrsf),
  });
}

/** La queja o el reclamo procedente abre su no conformidad en Calidad (B38, decisión 4). */
async function openNonconformity(
  tx: TenantTransaction,
  actor: ServiceActor,
  approverId: string,
  pqrsf: SvcPqrsf,
): Promise<void> {
  await handOff(tx, actor, pqrsf, 'nonconformity');
  const kindLabel = PQRSF_TYPES[pqrsfTypeSchema.parse(pqrsf.type)];
  await openNonconformityFromPqrsf(
    tx,
    { tenantId: actor.tenantId, userId: approverId, at: actor.at, meta: actor.meta },
    { id: pqrsf.id, code: pqrsf.code, kindLabel },
  );
}

function needsNonconformity(pqrsf: SvcPqrsf): boolean {
  const type = pqrsfTypeSchema.parse(pqrsf.type);
  return pqrsf.wellFounded === true && NONCONFORMITY_TYPES.includes(type);
}

@Injectable()
export class PqrsfStepsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private run(
    principal: Principal,
    meta: RequestMeta,
    id: string,
    work: (tx: TenantTransaction, actor: ServiceActor, pqrsf: SvcPqrsf) => Promise<void>,
  ): Promise<void> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      await work(tx, actor, await findPqrsf(tx, id));
    });
  }

  private async assertAssignable(tx: TenantTransaction, at: Date, assigneeId: string) {
    if (!(await assignablePeople(tx, at)).includes(assigneeId)) throw assigneeInvalid();
  }

  async classify(
    principal: Principal,
    target: ServiceTarget,
    input: ClassifyPqrsfRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target.id, async (tx, actor, pqrsf) => {
      await this.assertAssignable(tx, actor.at, input.assignee_id);
      const partyId = input.party_id === null ? null : await usableParty(tx, input.party_id);
      const deadline = await pqrsfDeadline(tx, pqrsf.receivedAt, input.type, input.privacy_kind);
      const toPrivacy = input.privacy_kind !== null;
      const after = await applyPqrsfStep(tx, actor, pqrsf, target.version, {
        action: 'classify',
        event: 'classified',
        data: {
          status: 'classified',
          type: input.type,
          privacyKind: input.privacy_kind,
          partyId,
          assigneeId: input.assignee_id,
          classifiedAt: pqrsf.classifiedAt ?? actor.at,
          ...deadline,
          transferredAt: toPrivacy ? (pqrsf.transferredAt ?? actor.at) : null,
          // Con otro plazo, los avisos se vuelven a calcular.
          warnedAt: null,
          breachedAt: null,
        },
        changes: { type: [pqrsf.type, input.type], term_days: deadline.termDays },
      });
      if (toPrivacy && pqrsf.transferredAt === null) {
        await handOff(tx, actor, after, 'transfer');
        await transferToPrivacy(tx, actor, after);
      }
    });
  }

  async assign(
    principal: Principal,
    target: ServiceTarget,
    input: AssignPqrsfRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target.id, async (tx, actor, pqrsf) => {
      await this.assertAssignable(tx, actor.at, input.assignee_id);
      if (pqrsf.assigneeId === input.assignee_id) {
        throw statusInvalid('La PQRSF ya está asignada a esa persona.');
      }
      await applyPqrsfStep(tx, actor, pqrsf, target.version, {
        action: 'assign',
        event: 'assigned',
        data: { assigneeId: input.assignee_id },
        changes: { assignee_id: [pqrsf.assigneeId, input.assignee_id] },
      });
    });
  }

  async draft(
    principal: Principal,
    target: ServiceTarget,
    input: DraftPqrsfRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target.id, async (tx, actor, pqrsf) => {
      assertStep(pqrsf, 'draft');
      if (pqrsf.approval === 'pending') {
        throw statusInvalid(
          'La respuesta está por aprobar. Espere la decisión o pida que la devuelvan.',
        );
      }
      const type = pqrsfTypeSchema.parse(pqrsf.type);
      const asksFounded = NONCONFORMITY_TYPES.includes(type);
      if (asksFounded && input.well_founded === null) {
        throw responseInvalid('Indique si la queja o el reclamo es procedente.');
      }
      await applyPqrsfStep(tx, actor, pqrsf, target.version, {
        action: 'draft',
        event: 'drafted',
        data: {
          status: 'in_progress',
          responseDraft: input.response,
          wellFounded: asksFounded ? input.well_founded : null,
          draftedBy: actor.userId,
        },
        changes: { well_founded: asksFounded ? input.well_founded : null },
      });
    });
  }

  async submit(principal: Principal, target: ServiceTarget, meta: RequestMeta): Promise<void> {
    await this.run(principal, meta, target.id, async (tx, actor, pqrsf) => {
      if (pqrsf.approval === 'pending') throw statusInvalid('La respuesta ya está por aprobar.');
      await applyPqrsfStep(tx, actor, pqrsf, target.version, {
        action: 'submit',
        event: 'submitted',
        data: { approval: 'pending', submittedAt: actor.at, returnReason: null },
      });
    });
  }

  async approve(principal: Principal, target: ServiceTarget, meta: RequestMeta): Promise<void> {
    await this.run(principal, meta, target.id, async (tx, actor, pqrsf) => {
      if (pqrsf.approval !== 'pending') throw statusInvalid('No hay una respuesta por aprobar.');
      if (pqrsf.draftedBy === actor.userId) throw approverInvalid();
      const nonconformity = needsNonconformity(pqrsf);
      const after = await applyPqrsfStep(tx, actor, pqrsf, target.version, {
        action: 'approve',
        event: 'responded',
        data: {
          status: 'responded',
          approval: 'none',
          submittedAt: null,
          response: pqrsf.responseDraft,
          approvedBy: actor.userId,
          respondedAt: actor.at,
          mailPending: pqrsf.requesterEmail === null ? null : 'response',
          nonconformityAt: nonconformity ? actor.at : null,
        },
        changes: { nonconformity },
      });
      if (nonconformity) await openNonconformity(tx, actor, principal.userId, after);
    });
  }

  async returnDraft(
    principal: Principal,
    target: ServiceTarget,
    input: ReturnPqrsfRequest,
    meta: RequestMeta,
  ): Promise<void> {
    await this.run(principal, meta, target.id, async (tx, actor, pqrsf) => {
      if (pqrsf.approval !== 'pending') throw statusInvalid('No hay una respuesta por aprobar.');
      if (pqrsf.draftedBy === actor.userId) throw approverInvalid();
      await applyPqrsfStep(tx, actor, pqrsf, target.version, {
        action: 'return',
        event: 'returned',
        data: { approval: 'returned', submittedAt: null, returnReason: input.reason },
        changes: { reason: input.reason },
      });
    });
  }

  async close(principal: Principal, target: ServiceTarget, meta: RequestMeta): Promise<void> {
    await this.run(principal, meta, target.id, async (tx, actor, pqrsf) => {
      await applyPqrsfStep(tx, actor, pqrsf, target.version, {
        action: 'close',
        event: 'closed',
        data: { status: 'closed', closedAt: actor.at },
      });
    });
  }
}
