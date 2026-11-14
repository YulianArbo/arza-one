import { Inject, Injectable } from '@nestjs/common';
import type {
  BillableMilestone as BillableMilestoneView,
  CreateCreditNote,
  CreatePayment,
  InvoiceDetail,
  InvoiceSummary,
  RegisterFiscalInvoice,
} from '@arza/contracts';

import type { FinInvoice, Prisma } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { recordAuditEvent } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addOutboxEvent } from '../../../platform/outbox/outbox.js';
import { billableMilestones } from '../../project/index.js';
import { commercialParties } from '../../party/index.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { idempotencyKeyReused } from '../../../platform/http/idempotency-key.js';
import { invoiceNotFound, invoiceStatusInvalid } from './invoice-messages.js';
import { invoiceDetail, invoiceList } from './invoice-queries.js';
import { requestInvoice } from './invoice-request.js';
import { registerFiscalInvoice } from './invoice-fiscal.js';
import { createCreditNote } from './invoice-credit-note.js';
import { createPayment } from './invoice-payment.js';
import type { InvoiceActor as Actor } from './invoice-actor.js';

@Injectable()
export class InvoicesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(principal: Principal): Promise<InvoiceSummary[]> {
    return this.database.withTenant(principal, invoiceList);
  }

  async detail(principal: Principal, id: string): Promise<InvoiceDetail> {
    return this.database.withTenant(principal, async (tx) => {
      const invoice = await tx.finInvoice.findFirst({ where: { id, deletedAt: null } });
      if (invoice === null) throw invoiceNotFound();
      const [parties, items, notes] = await Promise.all([
        commercialParties(tx, [invoice.partyId]),
        tx.finInvoiceItem.findMany({
          where: { invoiceId: id, deletedAt: null },
          orderBy: { position: 'asc' },
        }),
        tx.finCreditNote.findMany({
          where: { invoiceId: id, deletedAt: null },
          orderBy: { issueDate: 'desc' },
        }),
      ]);
      return invoiceDetail(
        tx,
        invoice,
        parties.get(invoice.partyId)?.name ?? 'Cliente',
        items,
        notes,
      );
    });
  }

  async availableMilestones(principal: Principal): Promise<BillableMilestoneView[]> {
    return this.database.withTenant(principal, async (tx) => {
      const [milestones, invoices] = await Promise.all([
        billableMilestones(tx),
        tx.finInvoice.findMany({
          where: { status: { not: 'voided' }, deletedAt: null },
          select: { milestoneId: true },
        }),
      ]);
      const invoiced = new Set(invoices.map((invoice) => invoice.milestoneId));
      const parties = await commercialParties(
        tx,
        milestones.map((milestone) => milestone.partyId),
      );
      return milestones
        .filter((milestone) => !invoiced.has(milestone.id))
        .map((milestone) => ({
          id: milestone.id,
          project_code: milestone.projectCode,
          project_name: milestone.projectName,
          party: { id: milestone.partyId, name: parties.get(milestone.partyId)?.name ?? 'Cliente' },
          contract_id: milestone.contractId,
          name: milestone.name,
          amount: milestone.amount,
        }));
    });
  }

  async request(actor: Actor, milestoneId: string, key: string): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, (tx) =>
      requestInvoice(tx, actor, milestoneId, key, at),
    );
  }

  async approve(actor: Actor, id: string, version: number, key: string): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const invoice = await this.find(tx, id);
      if (invoice.approvalKey === key && invoice.status === 'approved') return;
      if (invoice.approvalKey !== null) throw idempotencyKeyReused();
      if (invoice.status !== 'requested') {
        throw invoiceStatusInvalid('Solo se puede aprobar una factura solicitada.');
      }
      const { count } = await tx.finInvoice.updateMany({
        where: { id, version, status: 'requested', deletedAt: null },
        data: {
          status: 'approved',
          approvalKey: key,
          approvedBy: actor.principal.userId,
          approvedAt: at,
        },
      });
      if (count === 0) throw versionConflict();
      await this.audit(tx, actor, at, {
        action: 'finance.invoice.approve',
        event: 'fin.invoice.approved',
        invoice,
        changes: { status: ['requested', 'approved'] },
      });
    });
  }

  async registerFiscal(
    actor: Actor,
    id: string,
    version: number,
    key: string,
    input: RegisterFiscalInvoice,
  ): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const invoice = await this.find(tx, id);
      await registerFiscalInvoice(tx, actor, invoice, version, key, input, at);
    });
  }

  async void(actor: Actor, id: string, version: number, reason: string): Promise<void> {
    const at = this.clock.now();
    await this.database.withTenant(actor.principal, async (tx) => {
      const invoice = await this.find(tx, id);
      if (invoice.status !== 'requested' && invoice.status !== 'approved') {
        throw invoiceStatusInvalid(
          'Una factura emitida no se anula aquí; registre una nota crédito.',
        );
      }
      const { count } = await tx.finInvoice.updateMany({
        where: { id, version, status: invoice.status, deletedAt: null },
        data: {
          status: 'voided',
          voidedBy: actor.principal.userId,
          voidedAt: at,
          voidReason: reason,
        },
      });
      if (count === 0) throw versionConflict();
      await this.audit(tx, actor, at, {
        action: 'finance.invoice.void',
        event: 'fin.invoice.voided',
        invoice,
        changes: { status: [invoice.status, 'voided'], reason },
      });
    });
  }

  async createCreditNote(
    actor: Actor,
    id: string,
    key: string,
    input: CreateCreditNote,
  ): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, (tx) =>
      createCreditNote(tx, actor, id, key, input, at),
    );
  }

  async createPayment(
    actor: Actor,
    id: string,
    key: string,
    input: CreatePayment,
  ): Promise<string> {
    const at = this.clock.now();
    return this.database.withTenant(actor.principal, (tx) =>
      createPayment(tx, actor, id, key, input, at),
    );
  }

  private async find(tx: TenantTransaction, id: string): Promise<FinInvoice> {
    const invoice = await tx.finInvoice.findFirst({ where: { id, deletedAt: null } });
    if (invoice === null) throw invoiceNotFound();
    return invoice;
  }

  private async audit(
    tx: TenantTransaction,
    actor: Actor,
    at: Date,
    event: {
      readonly action: string;
      readonly event: string;
      readonly invoice: FinInvoice;
      readonly changes: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await recordAuditEvent(tx, {
      tenantId: actor.principal.tenantId,
      occurredAt: at,
      actor: { kind: 'user', id: actor.principal.userId },
      action: event.action,
      entityType: 'fin_invoice',
      entityId: event.invoice.id,
      result: 'success',
      changes: event.changes,
      meta: actor.meta,
    });
    await addOutboxEvent(tx, {
      tenantId: actor.principal.tenantId,
      eventType: event.event,
      actorId: actor.principal.userId,
      occurredAt: at,
      payload: { id: event.invoice.id, code: event.invoice.code },
    });
  }
}
