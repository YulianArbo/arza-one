import {
  OPEN_ENVELOPE_STATUSES,
  SIGNATURE_RULES,
  type CreateEnvelopeRequest,
  type EnvelopeOptions,
  type EnvelopeOptionsQuery,
} from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addDays, bogotaToday, companyIdentity, nextBusinessCode } from '../../core/index.js';
import { accountsWithRoles, type CompanySignerAccount } from '../../iam/index.js';
import {
  contractParty,
  partyVerified,
  signingPerson,
  type ContractParty,
} from '../../party/index.js';
import { endOfBogotaDay } from '../domain/signature-rules.js';
import type { ContractActor } from './contract-support.js';
import {
  partyNotVerified,
  signatureDatesInvalid,
  signatureStatusInvalid,
  signersInvalid,
} from './signature-messages.js';
import {
  ENVELOPES,
  ENVELOPE_SEQUENCE,
  appendSignatureEvent,
  eventFrom,
  recordSignatureChange,
} from './signature-records.js';
import { assertSignable, sourceDocument, type SignableDocument } from './signature-sources.js';

// Preparar el envío a firma (B25, decisiones 3 a 8): el documento aprobado, quiénes firman por el
// cliente (solo sus firmantes autorizados, con correo y documento), en qué orden, y la persona de la
// Dirección que firma de última por la empresa. El proceso queda «en preparación» hasta que la
// Dirección lo envía.

/** Rol que firma por la empresa (numeral 15.2: la Dirección firma los contratos). */
const COMPANY_SIGNER_ROLE = 'DIRECCION';

interface SignerCandidate {
  readonly personId: string | null;
  readonly name: string;
  readonly email: string | null;
  readonly document: string | null;
}

function optionOf(candidate: SignerCandidate) {
  return {
    person_id: candidate.personId,
    name: candidate.name,
    email: candidate.email,
    id_number: candidate.document,
    ready: candidate.email !== null && candidate.document !== null,
  };
}

/** La Dirección con su persona en Terceros: de ahí salen su nombre, su documento y su correo. */
async function companyCandidates(tx: TenantTransaction, at: Date) {
  const accounts = await accountsWithRoles(tx, [COMPANY_SIGNER_ROLE], at);
  const candidates: (SignerCandidate & { readonly userId: string })[] = [];
  for (const account of accounts) {
    candidates.push(await companyCandidate(tx, account));
  }
  return candidates;
}

async function companyCandidate(
  tx: TenantTransaction,
  account: CompanySignerAccount,
): Promise<SignerCandidate & { readonly userId: string }> {
  const person = account.partyId === null ? null : await signingPerson(tx, account.partyId);
  return {
    userId: account.id,
    personId: person?.personId ?? null,
    name: person?.name ?? account.displayName ?? account.email,
    email: account.email,
    document: person?.document ?? null,
  };
}

async function partyOf(tx: TenantTransaction, document: SignableDocument): Promise<ContractParty> {
  const party = await contractParty(tx, document.contract.partyId);
  if (party === null) throw signersInvalid('El cliente del contrato ya no existe en Terceros.');
  return party;
}

export async function envelopeOptions(
  tx: TenantTransaction,
  query: EnvelopeOptionsQuery,
  at: Date,
): Promise<EnvelopeOptions> {
  const document = await sourceDocument(tx, query.source, query.source_id);
  const party = await partyOf(tx, document);
  const today = bogotaToday(at);
  const company = await companyCandidates(tx, at);
  return {
    document: { code: document.code, title: document.title, sha256: document.sha256 },
    party: { id: party.id, name: party.name },
    party_verified: await partyVerified(tx, party.id, today),
    client_signers: party.signers.map(optionOf),
    company_signers: company.map((candidate) => ({
      ...optionOf(candidate),
      user_id: candidate.userId,
    })),
    default_expires_on: addDays(today, SIGNATURE_RULES.defaultDays),
    max_expires_on: addDays(today, SIGNATURE_RULES.maxDays),
  };
}

function assertDeadline(expiresOn: string, today: string): void {
  if (expiresOn < today || expiresOn > addDays(today, SIGNATURE_RULES.maxDays)) {
    throw signatureDatesInvalid();
  }
}

/** Cada firmante pedido es un firmante autorizado del cliente, con correo y documento. */
function clientSigners(party: ContractParty, ids: readonly string[]) {
  if (new Set(ids).size !== ids.length) throw signersInvalid('Una persona aparece dos veces.');
  return ids.map((id) => {
    const signer = party.signers.find((candidate) => candidate.personId === id);
    if (signer === undefined) {
      throw signersInvalid(
        `Solo firman por ${party.name} sus firmantes autorizados registrados en Terceros.`,
      );
    }
    if (signer.email === null || signer.document === null) {
      throw signersInvalid(
        `Registre en Terceros el correo y el documento de ${signer.name} antes de enviarle el documento.`,
      );
    }
    return { ...signer, email: signer.email, document: signer.document };
  });
}

async function companySigner(tx: TenantTransaction, userId: string, at: Date) {
  const candidate = (await companyCandidates(tx, at)).find((option) => option.userId === userId);
  if (candidate === undefined) {
    throw signersInvalid('Por la empresa firma una persona activa con el rol Dirección.');
  }
  if (candidate.email === null || candidate.document === null) {
    throw signersInvalid(
      `Vincule a ${candidate.name} con su persona en Terceros, con su documento, antes de que firme por la empresa.`,
    );
  }
  return { ...candidate, email: candidate.email, document: candidate.document };
}

async function assertNoOpenEnvelope(tx: TenantTransaction, document: SignableDocument) {
  const open = await tx.sigEnvelope.count({
    where: {
      contractId: document.contract.id,
      amendmentId: document.amendment?.id ?? null,
      status: { in: [...OPEN_ENVELOPE_STATUSES] },
      deletedAt: null,
    },
  });
  if (open > 0) {
    throw signatureStatusInvalid(
      'Este documento ya tiene un proceso de firma abierto. Anúlelo antes de preparar otro.',
    );
  }
}

type ClientSigner = ReturnType<typeof clientSigners>[number];
type CompanySigner = Awaited<ReturnType<typeof companySigner>>;

/** Los firmantes del cliente en el orden pedido y, de último, la empresa. */
async function createSigners(
  tx: TenantTransaction,
  where: { readonly tenantId: string; readonly envelopeId: string },
  party: ContractParty,
  signers: { readonly clients: readonly ClientSigner[]; readonly company: CompanySigner },
): Promise<void> {
  const identity = await companyIdentity(tx);
  const ownBehalf = party.signers.length === 1 && party.signers[0]?.personId === party.id;
  const { clients, company } = signers;
  await tx.sigSigner.createMany({
    data: [
      ...clients.map((signer, index) => ({
        ...where,
        kind: 'client',
        partyId: signer.personId,
        name: signer.name,
        email: signer.email,
        idNumber: signer.document,
        role: ownBehalf ? 'En nombre propio' : `Por ${party.name}`,
        signOrder: index + 1,
      })),
      {
        ...where,
        kind: 'company',
        userId: company.userId,
        partyId: company.personId,
        name: company.name,
        email: company.email,
        idNumber: company.document,
        role: `Por ${identity.legalName}`,
        signOrder: clients.length + 1,
      },
    ],
  });
}

/** El proceso con su código FE-AAAA-NNNN; la cadena de eventos parte de la huella del documento. */
async function createEnvelope(
  tx: TenantTransaction,
  actor: ContractActor,
  document: SignableDocument,
  input: CreateEnvelopeRequest,
) {
  return tx.sigEnvelope.create({
    data: {
      tenantId: actor.tenantId,
      code: await nextBusinessCode(tx, ENVELOPE_SEQUENCE, actor.at, ENVELOPES),
      source: document.source,
      contractId: document.contract.id,
      amendmentId: document.amendment?.id ?? null,
      documentFileId: document.fileId,
      documentSha256: document.sha256,
      documentCode: document.code,
      documentTitle: document.title,
      message: input.message,
      expiresAt: endOfBogotaDay(input.expires_on),
      lastEventHash: document.sha256,
    },
  });
}

/** Prepara el proceso en borrador; devuelve su identificador. */
export async function prepareEnvelope(
  tx: TenantTransaction,
  actor: ContractActor,
  input: CreateEnvelopeRequest,
): Promise<string> {
  const document = await sourceDocument(tx, input.source, input.source_id);
  assertSignable(document);
  await assertNoOpenEnvelope(tx, document);
  const today = bogotaToday(actor.at);
  assertDeadline(input.expires_on, today);
  const party = await partyOf(tx, document);
  if (!(await partyVerified(tx, party.id, today))) throw partyNotVerified();
  const clients = clientSigners(party, input.client_signer_ids);
  const company = await companySigner(tx, input.company_signer_id, actor.at);
  const envelope = await createEnvelope(tx, actor, document, input);
  await createSigners(tx, { tenantId: actor.tenantId, envelopeId: envelope.id }, party, {
    clients,
    company,
  });
  await appendSignatureEvent(tx, envelope.id, actor.at, eventFrom(actor, 'created', null));
  await recordSignatureChange(tx, actor, {
    action: 'signature.envelope.create',
    event: 'signature.envelope.created',
    envelope,
    changes: { signers: clients.length + 1, expires_on: input.expires_on },
  });
  return envelope.id;
}
