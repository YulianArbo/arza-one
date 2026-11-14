import { Inject, Injectable } from '@nestjs/common';
import {
  compensationStatusSchema,
  compensationTypeSchema,
  type Compensation,
  type CompensationApplyRequest,
  type CompensationDecisionRequest,
  type CompensationRequest,
} from '@arza/contracts';

import type { SvcCompensation } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import {
  compensationInvalid,
  datesInvalid,
  peopleNames,
  personRef,
  recordServiceChange,
  serviceActorOf,
  serviceNotFound,
  statusInvalid,
  type ServiceActor,
  type ServiceTarget,
} from './service-support.js';
import { ticketFor } from './ticket-records.js';

// Compensaciones técnicas al cliente (B28, RE-SAC-001, decisión 11): las propone quien atiende el
// tiquete y las aprueba o rechaza otra persona con el permiso de aprobar; nadie decide la suya (lo
// impide también la base de datos). Una aprobada deja el evento para que Facturación la aplique
// (B31); mientras tanto, quien aprueba registra cuándo se aplicó.

type WithTicket = SvcCompensation & { readonly ticket: { readonly code: string } };

function compensationAudit(compensation: SvcCompensation) {
  return {
    type: compensation.type,
    amount: compensation.amount?.toFixed(2) ?? null,
    hours: compensation.hours?.toNumber() ?? null,
    days: compensation.days,
    status: compensation.status,
  };
}

function payloadOf(compensation: WithTicket) {
  return {
    ticket_id: compensation.ticketId,
    code: compensation.ticket.code,
    type: compensation.type,
    amount: compensation.amount?.toFixed(2) ?? null,
    proposed_by: compensation.proposedBy,
  };
}

function view(compensation: WithTicket, names: ReadonlyMap<string, string>): Compensation {
  return {
    id: compensation.id,
    ticket: { id: compensation.ticketId, code: compensation.ticket.code },
    type: compensationTypeSchema.parse(compensation.type),
    amount: compensation.amount?.toFixed(2) ?? null,
    hours: compensation.hours?.toNumber() ?? null,
    days: compensation.days,
    reason: compensation.reason,
    status: compensationStatusSchema.parse(compensation.status),
    proposed_by: personRef(names, compensation.proposedBy),
    decided_by: personRef(names, compensation.approvedBy),
    decided_at: compensation.decidedAt?.toISOString() ?? null,
    decision_note: compensation.decisionNote,
    applied_on: compensation.appliedOn === null ? null : toCalendarDate(compensation.appliedOn),
    created_at: compensation.createdAt.toISOString(),
    version: compensation.version,
  };
}

async function findCompensation(
  tx: TenantTransaction,
  ticketId: string,
  id: string,
): Promise<WithTicket> {
  const compensation = await tx.svcCompensation.findFirst({
    where: { id, ticketId, deletedAt: null },
    include: { ticket: { select: { code: true } } },
  });
  if (compensation === null) throw serviceNotFound('La compensación');
  return compensation;
}

@Injectable()
export class CompensationsUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal, ability: AppAbility, ticketId: string): Promise<Compensation[]> {
    return this.database.withTenant(principal, async (tx) => {
      await ticketFor(tx, ability, ticketId, 'service.ticket.read');
      const rows = await tx.svcCompensation.findMany({
        where: { ticketId, deletedAt: null },
        include: { ticket: { select: { code: true } } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const names = await peopleNames(
        tx,
        rows.flatMap((row) => [row.proposedBy, row.approvedBy]),
      );
      return rows.map((row) => view(row, names));
    });
  }

  async propose(
    principal: Principal,
    ability: AppAbility,
    ticketId: string,
    input: CompensationRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const ticket = await ticketFor(tx, ability, ticketId, 'service.ticket.resolve');
      if (ticket.status === 'new') {
        throw statusInvalid('Asigne el tiquete antes de proponer una compensación.');
      }
      const created = await tx.svcCompensation.create({
        data: {
          tenantId: actor.tenantId,
          ticketId,
          type: input.type,
          amount: input.amount,
          hours: input.hours,
          days: input.days,
          reason: input.reason,
          proposedBy: principal.userId,
        },
        include: { ticket: { select: { code: true } } },
      });
      await this.record(tx, actor, created, 'propose', compensationAudit(created));
      return created.id;
    });
  }

  async decide(
    principal: Principal,
    target: ServiceTarget & { readonly ticketId: string },
    input: CompensationDecisionRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const compensation = await findCompensation(tx, target.ticketId, target.id);
      if (compensation.status !== 'proposed') throw statusInvalid('La compensación ya se decidió.');
      if (compensation.proposedBy === principal.userId) {
        throw compensationInvalid('Otra persona debe decidir la compensación que usted propuso.');
      }
      const status = input.approve ? 'approved' : 'rejected';
      const { count } = await tx.svcCompensation.updateMany({
        where: { id: target.id, version: target.version, status: 'proposed', deletedAt: null },
        data: {
          status,
          approvedBy: principal.userId,
          decidedAt: actor.at,
          decisionNote: input.note,
        },
      });
      if (count === 0) throw versionConflict();
      await this.record(tx, actor, compensation, input.approve ? 'approve' : 'reject', {
        ...compensationAudit(compensation),
        status: ['proposed', status],
        note: input.note,
      });
    });
  }

  async apply(
    principal: Principal,
    target: ServiceTarget & { readonly ticketId: string },
    input: CompensationApplyRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = serviceActorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const compensation = await findCompensation(tx, target.ticketId, target.id);
      if (compensation.status !== 'approved') {
        throw statusInvalid('Solo se aplica una compensación aprobada.');
      }
      if (input.applied_on > bogotaToday(actor.at)) {
        throw datesInvalid('La fecha de aplicación no puede ser futura.');
      }
      const { count } = await tx.svcCompensation.updateMany({
        where: { id: target.id, version: target.version, status: 'approved', deletedAt: null },
        data: { status: 'applied', appliedOn: fromCalendarDate(input.applied_on) },
      });
      if (count === 0) throw versionConflict();
      await this.record(tx, actor, compensation, 'apply', {
        ...compensationAudit(compensation),
        status: ['approved', 'applied'],
        applied_on: input.applied_on,
      });
    });
  }

  private async record(
    tx: TenantTransaction,
    actor: ServiceActor,
    compensation: WithTicket,
    step: 'propose' | 'approve' | 'reject' | 'apply',
    changes: Record<string, string | number | null | [string, string]>,
  ): Promise<void> {
    const past = { propose: 'proposed', approve: 'approved', reject: 'rejected', apply: 'applied' };
    await recordServiceChange(tx, actor, {
      action: `service.compensation.${step}`,
      event: `service.compensation.${past[step]}`,
      entityType: 'svc_compensation',
      entityId: compensation.id,
      changes: { ticket: compensation.ticket.code, ...changes },
      payload: payloadOf(compensation),
    });
  }
}
