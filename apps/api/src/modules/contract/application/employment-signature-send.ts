import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, companyIdentity, nextBusinessCode } from '../../core/index.js';
import { signingPerson } from '../../party/index.js';
import { endOfBogotaDay } from '../domain/signature-rules.js';
import { companySigner, type CompanySigner } from './signature-company-signers.js';
import { assertDeadline } from './signature-preparation.js';
import { signersInvalid } from './signature-messages.js';
import {
  ENVELOPES,
  ENVELOPE_SEQUENCE,
  appendSignatureEvent,
  eventFrom,
  recordSignatureChange,
} from './signature-records.js';
import { afterSignature } from './signature-progress.js';
import { EMPLOYMENT_SOURCE } from './signature-sources.js';
import type { ContractActor } from './contract-support.js';

/** Datos que Talento Humano ya validó para enviar el contrato laboral a firma. */
export interface EmploymentSignatureRequest {
  readonly contractId: string;
  readonly personId: string;
  readonly email: string;
  readonly companySignerId: string;
  readonly pdf: { readonly id: string; readonly sha256: string };
  readonly expiresOn: string;
  readonly message: string | null;
}

interface EmploymentPerson {
  readonly name: string;
  readonly document: string;
}

interface SignerScope {
  readonly tenantId: string;
  readonly envelopeId: string;
}

const MISSING_DOCUMENT =
  'Registre el documento de identidad de la persona antes de enviar a firma.';

/** Persona que firma como colaboradora: debe tener documento registrado en Terceros. */
async function employmentPerson(
  tx: TenantTransaction,
  personId: string,
): Promise<EmploymentPerson> {
  const person = await signingPerson(tx, personId);
  if (person === null) throw signersInvalid(MISSING_DOCUMENT);
  if (person.document === null) throw signersInvalid(MISSING_DOCUMENT);
  return { name: person.name, document: person.document };
}

/** Proceso creado ya enviado: la persona firma primero y la empresa de última. */
async function createEmploymentEnvelope(
  tx: TenantTransaction,
  actor: ContractActor,
  input: EmploymentSignatureRequest,
) {
  return tx.sigEnvelope.create({
    data: {
      tenantId: actor.tenantId,
      code: await nextBusinessCode(tx, ENVELOPE_SEQUENCE, actor.at, ENVELOPES),
      source: EMPLOYMENT_SOURCE,
      sourceId: input.contractId,
      partyId: input.personId,
      documentFileId: input.pdf.id,
      documentSha256: input.pdf.sha256,
      documentCode: input.contractId,
      documentTitle: 'Contrato laboral',
      message: input.message,
      expiresAt: endOfBogotaDay(input.expiresOn),
      lastEventHash: input.pdf.sha256,
      status: 'sent',
      sentAt: actor.at,
      sentBy: actor.userId,
      sendKey: `${EMPLOYMENT_SOURCE}:${input.contractId}`,
    },
  });
}

function clientRow(
  scope: SignerScope,
  input: EmploymentSignatureRequest,
  person: EmploymentPerson,
) {
  return {
    ...scope,
    kind: 'client',
    partyId: input.personId,
    name: person.name,
    email: input.email,
    idNumber: person.document,
    role: 'Colaborador',
    signOrder: 1,
  };
}

function companyRow(scope: SignerScope, company: CompanySigner, legalName: string) {
  return {
    ...scope,
    kind: 'company',
    userId: company.userId,
    partyId: company.personId,
    name: company.name,
    email: company.email,
    idNumber: company.document,
    role: `Por ${legalName}`,
    signOrder: 2,
  };
}

async function createEmploymentSigners(
  tx: TenantTransaction,
  scope: SignerScope,
  input: EmploymentSignatureRequest,
  person: EmploymentPerson,
  company: CompanySigner,
  legalName: string,
): Promise<void> {
  await tx.sigSigner.createMany({
    data: [clientRow(scope, input, person), companyRow(scope, company, legalName)],
  });
}

async function announceEmploymentSignature(
  tx: TenantTransaction,
  actor: ContractActor,
  envelope: Awaited<ReturnType<typeof createEmploymentEnvelope>>,
  input: EmploymentSignatureRequest,
): Promise<void> {
  await appendSignatureEvent(tx, envelope.id, actor.at, eventFrom(actor, 'created', null));
  await appendSignatureEvent(tx, envelope.id, actor.at, eventFrom(actor, 'sent', null));
  await recordSignatureChange(tx, actor, {
    action: 'signature.envelope.send',
    event: 'signature.envelope.sent',
    envelope,
    changes: { status: [null, 'sent'], signers: 2, expires_on: input.expiresOn },
    payload: { source_id: input.contractId, party_id: input.personId },
  });
}

/** Envía el PDF validado por Talento Humano a la persona y luego a Dirección. */
export async function sendEmploymentSignature(
  tx: TenantTransaction,
  actor: ContractActor,
  input: EmploymentSignatureRequest,
): Promise<{ id: string; code: string }> {
  assertDeadline(input.expiresOn, bogotaToday(actor.at));
  const person = await employmentPerson(tx, input.personId);
  const company = await companySigner(tx, input.companySignerId, actor.at);
  const identity = await companyIdentity(tx);
  const envelope = await createEmploymentEnvelope(tx, actor, input);
  await createEmploymentSigners(
    tx,
    { tenantId: actor.tenantId, envelopeId: envelope.id },
    input,
    person,
    company,
    identity.legalName,
  );
  await announceEmploymentSignature(tx, actor, envelope, input);
  await afterSignature(tx, actor, envelope.id);
  return { id: envelope.id, code: envelope.code };
}
