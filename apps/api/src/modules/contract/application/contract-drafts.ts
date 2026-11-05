import {
  contractKindSchema,
  type ContractKind,
  type CreateContractRequest,
  type UpdateContractRequest,
} from '@arza/contracts';

import type { CtrContract } from '../../../generated/prisma/client.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { fromCalendarDate, nextBusinessCode } from '../../core/index.js';
import { needsReview } from '../domain/clause-composition.js';
import { activeTemplate, buildClauses, replaceClauses } from './contract-clauses.js';
import { datesInvalid, valueRequired } from './contract-messages.js';
import {
  CONTRACTS,
  CONTRACT_SEQUENCE,
  SERVICE_ORDERS,
  SERVICE_ORDER_SEQUENCE,
  contractAudit,
  contractEventPayload,
  findContract,
  updateContractVersioned,
} from './contract-records.js';
import {
  recordContractChange,
  responsibleFor,
  type ContractActor,
  type ContractTarget,
} from './contract-support.js';
import { contractValues, quoteReference, sourceQuote, usableParty } from './contract-values.js';

// El borrador de un contrato (B24): se genera desde la plantilla con los datos del cliente y de la
// cotización, y cada vez que se guarda se vuelven a llenar las variables. Las cláusulas cambiadas
// quedan marcadas como modificadas.

type ContractFields = Omit<UpdateContractRequest, 'clauses'>;

/** Las fechas van en orden y el valor existe, salvo en un acuerdo de confidencialidad. */
function assertTerms(kind: ContractKind, input: ContractFields): void {
  if (input.ends_on < input.starts_on) {
    throw datesInvalid('La fecha de terminación debe ser igual o posterior a la de inicio.');
  }
  if (kind !== 'nda' && (input.value === null || input.payment_terms === null)) {
    throw valueRequired();
  }
}

function dataColumns(input: ContractFields) {
  return {
    title: input.title,
    object: input.object,
    value: input.value,
    paymentTerms: input.payment_terms,
    startsOn: fromCalendarDate(input.starts_on),
    endsOn: fromCalendarDate(input.ends_on),
    renewal: input.renewal,
    clientSignerName: input.client_signer_name,
    clientSignerDocument: input.client_signer_document,
  };
}

async function nextCode(tx: TenantTransaction, kind: ContractKind, at: Date): Promise<string> {
  return kind === 'service_order'
    ? nextBusinessCode(tx, SERVICE_ORDER_SEQUENCE, at, SERVICE_ORDERS)
    : nextBusinessCode(tx, CONTRACT_SEQUENCE, at, CONTRACTS);
}

async function valuesFor(
  tx: TenantTransaction,
  source: Pick<CtrContract, 'code' | 'partyId' | 'quoteId'>,
  input: ContractFields,
) {
  const party = await usableParty(tx, source.partyId);
  const quote = await sourceQuote(tx, source.quoteId, source.partyId);
  const data = {
    code: source.code,
    object: input.object,
    value: input.value,
    paymentTerms: input.payment_terms,
    startsOn: input.starts_on,
    endsOn: input.ends_on,
    signerName: input.client_signer_name,
    signerDocument: input.client_signer_document,
  };
  return contractValues(tx, party, data, quoteReference(quote));
}

/** Genera el contrato desde la plantilla: idéntico al modelo salvo las variables. */
export async function generateContract(
  tx: TenantTransaction,
  actor: ContractActor,
  input: CreateContractRequest,
): Promise<string> {
  const template = await activeTemplate(tx, input.template_id);
  const kind = contractKindSchema.parse(template.kind);
  assertTerms(kind, input);
  const responsibleId = await responsibleFor(tx, actor, input.responsible_id);
  const code = await nextCode(tx, kind, actor.at);
  const source = { code, partyId: input.party_id, quoteId: input.quote_id };
  const values = await valuesFor(tx, source, input);
  const clauses = await buildClauses(tx, template.id, null, values);
  const contract = await tx.ctrContract.create({
    data: {
      tenantId: actor.tenantId,
      ...source,
      kind,
      templateId: template.id,
      responsibleId,
      variableValues: { ...values },
      ...dataColumns(input),
    },
  });
  await replaceClauses(tx, contract, clauses, actor.at);
  await recordContractChange(tx, actor, {
    action: 'contract.create',
    event: 'contract.created',
    entityType: 'ctr_contract',
    entityId: contract.id,
    changes: { ...contractAudit(contract), template: template.code, quote_id: input.quote_id },
    payload: { ...contractEventPayload(contract), quote_id: input.quote_id },
  });
  return contract.id;
}

/** Guarda el borrador completo: los datos y las cláusulas, llenadas con los datos de hoy. */
export async function saveDraft(
  tx: TenantTransaction,
  actor: ContractActor,
  before: CtrContract,
  target: ContractTarget,
  input: UpdateContractRequest,
): Promise<void> {
  assertTerms(contractKindSchema.parse(before.kind), input);
  const responsibleId = await responsibleFor(tx, actor, input.responsible_id);
  const values = await valuesFor(tx, before, input);
  const clauses = await buildClauses(tx, before.templateId, input.clauses, values);
  await updateContractVersioned(tx, target, {
    ...dataColumns(input),
    responsibleId,
    variableValues: { ...values },
    hasModifiedClauses: clauses.some(needsReview),
  });
  await replaceClauses(tx, before, clauses, actor.at);
  const after = await findContract(tx, target.id);
  await recordContractChange(tx, actor, {
    action: 'contract.update',
    event: 'contract.updated',
    entityType: 'ctr_contract',
    entityId: target.id,
    changes: {
      code: before.code,
      ...changesBetween(contractAudit(before), contractAudit(after)),
      clauses: clauses.length,
      modified_clauses: clauses.filter(needsReview).map((clause) => clause.title),
    },
  });
}
