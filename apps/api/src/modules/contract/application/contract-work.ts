import { createHash } from 'node:crypto';

import { OBLIGATION_NOTICE_DAYS, daysUntil, expiryAlertDue } from '@arza/contracts';
import { printedDate } from '@arza/templates';

import type { CtrContract } from '../../../generated/prisma/client.js';
import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addDays, bogotaToday, fromCalendarDate, toCalendarDate } from '../../core/index.js';
import { storeGeneratedPdf, type FileStorage } from '../../doc/index.js';
import { hasActiveWorkflow, startWorkflow } from '../../wf/index.js';
import { EXPIRY_FLOW } from '../domain/contract-flows.js';
import {
  amendmentFileName,
  amendmentHtml,
  contractFileName,
  contractHtml,
  type ContractHtml,
} from './contract-document.js';
import { contractAudit, contractEventPayload } from './contract-records.js';
import { recordContractChange, systemActor } from './contract-support.js';

// Trabajo de Contratos en el worker (B24). Cada pocos segundos: el PDF definitivo de cada contrato y
// de cada otrosí aprobados, con su huella SHA-256. Cada día: las alertas de vencimiento a 90, 60 y
// 30 días (tarea al responsable y contrato «por vencer»), el fin de los que cumplieron su plazo, el
// aviso de las obligaciones que se acercan y las que vencieron. Repetirlo no cambia nada, porque
// solo toma lo pendiente.

export interface ContractWorkDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
  readonly storage: Pick<FileStorage, 'read' | 'put' | 'delete'>;
  readonly convertHtml: (document: ContractHtml) => Promise<Buffer>;
}

export interface ContractFollowUpResult {
  readonly alerts: number;
  readonly ended: number;
  readonly reminders: number;
  readonly overdue: number;
}

/** Cuántos registros toma por empresa en cada pasada; los demás, en la siguiente. */
const BATCH = 25;

interface Scope {
  readonly tenantId: string;
  readonly userId: null;
}

function scopeOf(tenantId: string): Scope {
  return { tenantId, userId: null };
}

async function renderContract(deps: ContractWorkDependencies, tenantId: string, id: string) {
  const prepared = await deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const contract = await tx.ctrContract.findFirst({
      where: { id, status: 'approved', pdfStatus: 'pending', deletedAt: null },
    });
    return contract === null ? null : { contract, html: await contractHtml(tx, contract) };
  });
  if (prepared === null) return false;
  const content = await deps.convertHtml(prepared.html);
  const sha256 = createHash('sha256').update(content).digest('hex');
  const target = { tenantId, fileName: contractFileName(prepared.contract), content };
  return storeGeneratedPdf(deps, target, async (tx, fileId, at) => {
    const { count } = await tx.ctrContract.updateMany({
      where: { id, status: 'approved', pdfStatus: 'pending' },
      data: { pdfStatus: 'ready', pdfFileId: fileId, pdfSha256: sha256 },
    });
    if (count === 0) return false;
    await recordContractChange(tx, systemActor(tenantId, at), {
      action: 'contract.render',
      event: 'contract.rendered',
      entityType: 'ctr_contract',
      entityId: id,
      changes: { code: prepared.contract.code, pdf_file_id: fileId, pdf_sha256: sha256 },
      payload: contractEventPayload(prepared.contract),
    });
    return true;
  });
}

async function renderAmendment(deps: ContractWorkDependencies, tenantId: string, id: string) {
  const prepared = await deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const amendment = await tx.ctrAmendment.findFirst({
      where: { id, pdfStatus: 'pending', deletedAt: null },
    });
    if (amendment === null) return null;
    const contract = await tx.ctrContract.findFirstOrThrow({ where: { id: amendment.contractId } });
    return { amendment, html: await amendmentHtml(tx, contract, amendment) };
  });
  if (prepared === null) return false;
  const content = await deps.convertHtml(prepared.html);
  const sha256 = createHash('sha256').update(content).digest('hex');
  const target = { tenantId, fileName: amendmentFileName(prepared.amendment), content };
  return storeGeneratedPdf(deps, target, async (tx, fileId, at) => {
    const { count } = await tx.ctrAmendment.updateMany({
      where: { id, pdfStatus: 'pending' },
      data: { pdfStatus: 'ready', pdfFileId: fileId, pdfSha256: sha256 },
    });
    if (count === 0) return false;
    await recordContractChange(tx, systemActor(tenantId, at), {
      action: 'contract.amendment.render',
      event: 'contract.amendment.rendered',
      entityType: 'ctr_amendment',
      entityId: id,
      changes: { code: prepared.amendment.code, pdf_file_id: fileId, pdf_sha256: sha256 },
      payload: { code: prepared.amendment.code, contract_id: prepared.amendment.contractId },
    });
    return true;
  });
}

async function tenantsBy(deps: ContractWorkDependencies, fn: 'pdf' | 'follow-up') {
  const rows = await deps.database.withoutTenant((tx) =>
    fn === 'pdf'
      ? tx.$queryRaw<{ id: string }[]>`SELECT ctr_tenants_with_pdf_work() AS id`
      : tx.$queryRaw<{ id: string }[]>`SELECT ctr_tenants_with_follow_up() AS id`,
  );
  return rows.map((row) => row.id);
}

/** Genera los PDF pendientes de contratos y otrosíes de todas las empresas. */
export async function renderPendingContracts(deps: ContractWorkDependencies): Promise<number> {
  let rendered = 0;
  for (const tenantId of await tenantsBy(deps, 'pdf')) {
    const pending = await deps.database.withTenant(scopeOf(tenantId), async (tx) => ({
      contracts: await tx.ctrContract.findMany({
        where: { status: 'approved', pdfStatus: 'pending', deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
      }),
      amendments: await tx.ctrAmendment.findMany({
        where: { pdfStatus: 'pending', deletedAt: null },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
      }),
    }));
    for (const { id } of pending.contracts)
      if (await renderContract(deps, tenantId, id)) rendered += 1;
    for (const { id } of pending.amendments)
      if (await renderAmendment(deps, tenantId, id)) rendered += 1;
  }
  return rendered;
}

/** Terminó su plazo sin prórroga: queda terminado. */
async function endContract(tx: TenantTransaction, contract: CtrContract, at: Date): Promise<void> {
  const endsOn = toCalendarDate(contract.endsOn);
  const reason = `Terminó su plazo el ${printedDate(endsOn)}.`;
  await tx.ctrContract.update({
    where: { id: contract.id },
    data: {
      status: 'terminated',
      terminatedOn: contract.endsOn,
      terminationReason: reason,
      closedAt: at,
    },
  });
  await recordContractChange(tx, systemActor(contract.tenantId, at), {
    action: 'contract.expire',
    event: 'contract.expired',
    entityType: 'ctr_contract',
    entityId: contract.id,
    changes: { ...contractAudit(contract), status: [contract.status, 'terminated'], reason },
    payload: contractEventPayload(contract),
  });
}

/** Alerta de vencimiento: el contrato queda por vencer y su responsable recibe la tarea. */
async function alertContract(
  tx: TenantTransaction,
  contract: CtrContract,
  days: number,
  at: Date,
): Promise<void> {
  const actor = systemActor(contract.tenantId, at);
  await tx.ctrContract.update({
    where: { id: contract.id },
    data: { status: 'expiring', lastAlertDays: days },
  });
  // Si la tarea anterior sigue abierta, basta con el aviso: no se duplica la tarea.
  if (!(await hasActiveWorkflow(tx, EXPIRY_FLOW, contract.id))) {
    const initiator = contract.responsibleId ?? contract.createdBy;
    await startWorkflow(tx, actor, {
      key: EXPIRY_FLOW,
      entityType: EXPIRY_FLOW,
      entityId: contract.id,
      title: `${contract.code} vence el ${printedDate(toCalendarDate(contract.endsOn))}`,
      facts: { days },
      ...(initiator === null ? {} : { initiator }),
    });
  }
  await recordContractChange(tx, actor, {
    action: 'contract.expiry.alert',
    event: 'contract.expiring',
    entityType: 'ctr_contract',
    entityId: contract.id,
    changes: { ...contractAudit(contract), status: [contract.status, 'expiring'], days },
    payload: { ...contractEventPayload(contract), days },
  });
}

async function followContract(
  deps: ContractWorkDependencies,
  tenantId: string,
  id: string,
): Promise<'alert' | 'ended' | null> {
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const at = deps.clock.now();
    const contract = await tx.ctrContract.findFirst({
      where: { id, status: { in: ['active', 'expiring'] }, deletedAt: null },
    });
    if (contract === null) return null;
    const daysLeft = daysUntil(bogotaToday(at), toCalendarDate(contract.endsOn));
    if (daysLeft < 0) {
      await endContract(tx, contract, at);
      return 'ended';
    }
    const days = expiryAlertDue(daysLeft, contract.lastAlertDays);
    if (days === null) return null;
    await alertContract(tx, contract, days, at);
    return 'alert';
  });
}

async function followObligation(
  deps: ContractWorkDependencies,
  tenantId: string,
  id: string,
): Promise<'reminder' | 'overdue' | null> {
  return deps.database.withTenant(scopeOf(tenantId), async (tx) => {
    const at = deps.clock.now();
    const obligation = await tx.ctrObligation.findFirst({
      where: { id, status: 'pending', deletedAt: null },
      include: { contract: { select: { code: true } } },
    });
    if (obligation === null) return null;
    const daysLeft = daysUntil(bogotaToday(at), toCalendarDate(obligation.dueOn));
    const overdue = daysLeft < 0;
    if (!overdue && (daysLeft > OBLIGATION_NOTICE_DAYS || obligation.remindedAt !== null))
      return null;
    await tx.ctrObligation.update({
      where: { id },
      data: overdue ? { status: 'overdue' } : { remindedAt: at },
    });
    await recordContractChange(tx, systemActor(tenantId, at), {
      action: overdue ? 'contract.obligation.overdue' : 'contract.obligation.remind',
      event: overdue ? 'contract.obligation.overdue' : 'contract.obligation.due',
      entityType: 'ctr_obligation',
      entityId: id,
      changes: { due_on: toCalendarDate(obligation.dueOn), days_left: daysLeft },
      payload: {
        contract_id: obligation.contractId,
        code: obligation.contract.code,
        responsible_id: obligation.responsibleId,
        due_on: toCalendarDate(obligation.dueOn),
      },
    });
    return overdue ? 'overdue' : 'reminder';
  });
}

async function followTenant(deps: ContractWorkDependencies, tenantId: string, today: string) {
  const due = await deps.database.withTenant(scopeOf(tenantId), async (tx) => ({
    contracts: await tx.ctrContract.findMany({
      where: { status: { in: ['active', 'expiring'] }, deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
    }),
    obligations: await tx.ctrObligation.findMany({
      where: {
        status: 'pending',
        deletedAt: null,
        contract: { status: { not: 'terminated' } },
        dueOn: { lte: fromCalendarDate(addDays(today, OBLIGATION_NOTICE_DAYS)) },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    }),
  }));
  const results = {
    contracts: [] as ('alert' | 'ended' | null)[],
    obligations: [] as ('reminder' | 'overdue' | null)[],
  };
  for (const { id } of due.contracts)
    results.contracts.push(await followContract(deps, tenantId, id));
  for (const { id } of due.obligations) {
    results.obligations.push(await followObligation(deps, tenantId, id));
  }
  return results;
}

/** Revisión diaria de vencimientos y obligaciones de todas las empresas. */
export async function followUpContracts(
  deps: ContractWorkDependencies,
): Promise<ContractFollowUpResult> {
  const today = bogotaToday(deps.clock.now());
  const totals = { alerts: 0, ended: 0, reminders: 0, overdue: 0 };
  for (const tenantId of await tenantsBy(deps, 'follow-up')) {
    const { contracts, obligations } = await followTenant(deps, tenantId, today);
    totals.alerts += contracts.filter((result) => result === 'alert').length;
    totals.ended += contracts.filter((result) => result === 'ended').length;
    totals.reminders += obligations.filter((result) => result === 'reminder').length;
    totals.overdue += obligations.filter((result) => result === 'overdue').length;
  }
  return totals;
}
