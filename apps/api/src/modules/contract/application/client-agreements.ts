import { createHash, randomBytes } from 'node:crypto';

import {
  contractKindSchema,
  contractStatusSchema,
  envelopeStatusSchema,
  type ContractStatus,
  type PortalContract,
  type PortalSignableKind,
  type PortalSignature,
  type PortalSignatureList,
} from '@arza/contracts';

import type { Prisma, SigEnvelope, SigSigner } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { contractNotFound, pdfNotReady } from './contract-messages.js';
import type { ContractActor } from './contract-support.js';
import { signingUrl } from './signature-mail.js';
import { envelopeNotFound, signatureStatusInvalid } from './signature-messages.js';
import { auditSignature } from './signature-records.js';
import { ACCEPTANCE_SOURCE } from './signature-sources.js';

// Lo que el portal del cliente ve de Contratos y de la firma electrónica (B30, decisiones 4 y 6).
// Los contratos de su empresa desde que se envían a firma, nunca en borrador ni en revisión; los
// procesos de firma de sus contratos, otrosíes y actas de entrega; y el enlace de firma para quien
// le toca firmar con el correo de su cuenta. Lo de otra empresa «no existe».

/** Estados en que el cliente ve el contrato: desde que se envía a firma. */
const CLIENT_CONTRACT_STATUSES: readonly ContractStatus[] = [
  'in_signature',
  'active',
  'expiring',
  'terminated',
];

/** Procesos terminados que se siguen mostrando: los de los últimos 90 días. */
const RECENT_DAYS = 90;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function contractWhere(partyId: string): Prisma.CtrContractWhereInput {
  return { partyId, status: { in: [...CLIENT_CONTRACT_STATUSES] }, deletedAt: null };
}

/** Los contratos de la empresa cliente que ya se enviaron a firma. */
export async function clientContracts(
  tx: TenantTransaction,
  partyId: string,
): Promise<PortalContract[]> {
  const contracts = await tx.ctrContract.findMany({
    where: contractWhere(partyId),
    orderBy: [{ startsOn: 'desc' }, { id: 'asc' }],
  });
  return contracts.map((contract) => ({
    id: contract.id,
    code: contract.code,
    kind: contractKindSchema.parse(contract.kind),
    title: contract.title,
    status: contractStatusSchema.parse(contract.status),
    value: contract.value === null ? null : contract.value.toFixed(2),
    starts_on: toCalendarDate(contract.startsOn),
    ends_on: toCalendarDate(contract.endsOn),
    signed_on: contract.signedOn === null ? null : toCalendarDate(contract.signedOn),
    has_signed_copy: contract.signedFileId !== null,
  }));
}

/** Un contrato o un otrosí firmado de la empresa cliente, para la lista de documentos. */
export interface ClientSignedDocument {
  readonly kind: 'contract' | 'amendment';
  readonly id: string;
  readonly fileId: string;
  readonly title: string;
  readonly code: string;
  readonly datedAt: Date;
}

/** Los contratos y otrosíes firmados de la empresa cliente. */
export async function clientSignedDocuments(
  tx: TenantTransaction,
  partyId: string,
): Promise<ClientSignedDocument[]> {
  const [contracts, amendments] = await Promise.all([
    tx.ctrContract.findMany({
      where: { ...contractWhere(partyId), signedFileId: { not: null } },
      orderBy: [{ signedOn: 'desc' }, { id: 'asc' }],
    }),
    tx.ctrAmendment.findMany({
      where: { signedFileId: { not: null }, deletedAt: null, contract: contractWhere(partyId) },
      include: { contract: { select: { title: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    }),
  ]);
  return [
    ...contracts.map((contract) => ({
      kind: 'contract' as const,
      id: contract.id,
      fileId: contract.signedFileId ?? '',
      title: contract.title,
      code: contract.code,
      datedAt: contract.signedOn ?? contract.updatedAt,
    })),
    ...amendments.map((amendment) => ({
      kind: 'amendment' as const,
      id: amendment.id,
      fileId: amendment.signedFileId ?? '',
      title: `Otrosí de ${amendment.contract.title}`,
      code: amendment.code,
      datedAt: amendment.updatedAt,
    })),
  ];
}

/** El archivo firmado de un contrato de la empresa; si no es suyo, «no existe». */
export async function clientContractFile(
  tx: TenantTransaction,
  partyId: string,
  id: string,
): Promise<string> {
  const contract = await tx.ctrContract.findFirst({ where: { ...contractWhere(partyId), id } });
  if (contract === null) throw contractNotFound('El contrato');
  if (contract.signedFileId === null) throw pdfNotReady();
  return contract.signedFileId;
}

/** El archivo firmado de un otrosí de la empresa; si no es suyo, «no existe». */
export async function clientAmendmentFile(
  tx: TenantTransaction,
  partyId: string,
  id: string,
): Promise<string> {
  const amendment = await tx.ctrAmendment.findFirst({
    where: { id, deletedAt: null, contract: contractWhere(partyId) },
  });
  if (amendment === null) throw contractNotFound('El otrosí');
  if (amendment.signedFileId === null) throw pdfNotReady();
  return amendment.signedFileId;
}

// Firmas -----------------------------------------------------------------------------------------

/** Los procesos de firma de la empresa: sus contratos y otrosíes, y sus actas de entrega. */
function envelopeWhere(partyId: string): Prisma.SigEnvelopeWhereInput {
  return {
    deletedAt: null,
    status: { notIn: ['draft', 'cancelled'] },
    OR: [{ contract: { partyId } }, { source: ACCEPTANCE_SOURCE, partyId }],
  };
}

type EnvelopeWithSigners = SigEnvelope & { signers: SigSigner[] };

function kindOf(envelope: SigEnvelope): PortalSignableKind {
  if (envelope.source === ACCEPTANCE_SOURCE) return 'acceptance';
  return envelope.amendmentId === null ? 'contract' : 'amendment';
}

/** El firmante del cliente con el correo de la cuenta a quien le toca firmar ahora. */
function myTurn(envelope: EnvelopeWithSigners, email: string): SigSigner | undefined {
  if (envelope.status !== 'sent') return undefined;
  return envelope.signers.find(
    (signer) =>
      signer.kind === 'client' &&
      signer.status === 'pending' &&
      signer.email.toLowerCase() === email.toLowerCase(),
  );
}

/** Qué rol permite firmar desde el portal cada clase de documento. */
export interface SigningRights {
  readonly contracts: boolean;
  readonly acceptances: boolean;
}

function mayCover(kind: PortalSignableKind, rights: SigningRights): boolean {
  return kind === 'acceptance' ? rights.acceptances : rights.contracts;
}

function signatureView(
  envelope: EnvelopeWithSigners,
  email: string,
  rights: SigningRights,
): PortalSignature {
  const kind = kindOf(envelope);
  const turn = myTurn(envelope, email) !== undefined;
  return {
    id: envelope.id,
    code: envelope.code,
    kind,
    document_code: envelope.documentCode,
    document_title: envelope.documentTitle,
    status: envelopeStatusSchema.parse(envelope.status),
    sent_at: envelope.sentAt?.toISOString() ?? null,
    expires_at: envelope.expiresAt.toISOString(),
    completed_at: envelope.completedAt?.toISOString() ?? null,
    signed: envelope.signers.filter((signer) => signer.status === 'signed').length,
    signers: envelope.signers.length,
    my_turn: turn,
    can_sign: turn && mayCover(kind, rights),
  };
}

/** Los procesos en firma y los terminados hace poco, con lo que le toca a la persona. */
export async function clientSignatures(
  tx: TenantTransaction,
  viewer: { readonly partyId: string; readonly email: string; readonly rights: SigningRights },
  now: Date,
): Promise<PortalSignatureList> {
  const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000);
  const envelopes = await tx.sigEnvelope.findMany({
    where: {
      ...envelopeWhere(viewer.partyId),
      AND: [{ OR: [{ status: 'sent' }, { updatedAt: { gte: since } }] }],
    },
    include: { signers: { where: { deletedAt: null }, orderBy: { signOrder: 'asc' } } },
    orderBy: [{ sentAt: 'desc' }, { id: 'asc' }],
  });
  const views = envelopes.map((envelope) => signatureView(envelope, viewer.email, viewer.rights));
  return {
    pending: views.filter((view) => view.status === 'sent'),
    recent: views.filter((view) => view.status !== 'sent'),
  };
}

/**
 * Enlace nuevo de un solo uso para que la persona firme ya, en la pantalla de firma de siempre,
 * que sigue pidiendo el código enviado a su correo (decisión 4). El enlace que llegó antes por
 * correo deja de servir. Solo para quien le toca firmar con el correo de su cuenta.
 */
export async function issueClientSigningLink(
  tx: TenantTransaction,
  actor: ContractActor,
  request: {
    readonly partyId: string;
    readonly email: string;
    readonly envelopeId: string;
    readonly rights: SigningRights;
    readonly appUrl: string;
  },
): Promise<string> {
  const envelope = await tx.sigEnvelope.findFirst({
    where: { ...envelopeWhere(request.partyId), id: request.envelopeId },
    include: { signers: { where: { deletedAt: null }, orderBy: { signOrder: 'asc' } } },
  });
  if (envelope === null) throw envelopeNotFound();
  const signer = myTurn(envelope, request.email);
  if (signer === undefined || !mayCover(kindOf(envelope), request.rights)) {
    throw signatureStatusInvalid(
      'Este documento no espera su firma ahora. Si cree que es un error, escríbanos por Soporte.',
    );
  }
  const token = randomBytes(32).toString('base64url');
  await tx.sigSigner.update({
    where: { id: signer.id },
    data: { linkTokenHash: sha256(token), linkExpiresAt: envelope.expiresAt },
  });
  await auditSignature(tx, actor, 'signature.link.issue', envelope, {
    signer_id: signer.id,
    kind: 'portal',
  });
  return signingUrl(request.appUrl, token);
}
