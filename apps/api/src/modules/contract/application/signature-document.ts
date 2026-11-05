import {
  SIGNATURE_EVENTS,
  SIGNATURE_METHODS,
  signatureEventTypeSchema,
  signatureMethodSchema,
} from '@arza/contracts';
import {
  evidenceCertificateBody,
  institutionalFooter,
  institutionalHeader,
  printPage,
  signaturesPageBody,
  type SignatureEvidence,
} from '@arza/templates';

import type { SigEvent, SigSigner } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { companyIdentity } from '../../core/index.js';
import type { ContractHtml } from './contract-document.js';
import type { EnvelopeWithSigners } from './signature-records.js';
import { envelopeEvents } from './signature-views.js';

// La página final de firmas y el certificado de evidencia de un proceso firmado por todos (B25,
// numeral 19.3), listos para que Gotenberg los convierta con el encabezado y el pie institucionales.

const BOGOTA_DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

/** «30/10/2026, 3:05:12 p. m.», en hora de Colombia. */
function bogota(moment: Date): string {
  return BOGOTA_DATE_TIME.format(moment);
}

/** Dirección de la página pública de verificación. */
export function verifyUrl(appUrl: string): string {
  return new URL('/verificar', appUrl).toString();
}

function signedBy(signer: SigSigner): SignatureEvidence['signers'][number] {
  const at = signer.signedAt ?? new Date(0);
  const method = signer.method === null ? null : signatureMethodSchema.parse(signer.method);
  return {
    name: signer.name,
    idNumber: signer.idNumber,
    role: signer.role,
    email: signer.email,
    method: method === null ? '—' : SIGNATURE_METHODS[method],
    signedAtBogota: bogota(at),
    signedAtUtc: at.toISOString(),
    ip: signer.signIp ?? '—',
    userAgent: signer.signUserAgent ?? '—',
    acceptanceText: signer.acceptanceText ?? '—',
  };
}

function eventLine(event: SigEvent, names: ReadonlyMap<string, string>) {
  return {
    sequence: event.sequence,
    label: SIGNATURE_EVENTS[signatureEventTypeSchema.parse(event.type)],
    signer: event.signerId === null ? 'ARZA ONE' : (names.get(event.signerId) ?? '—'),
    atBogota: bogota(event.occurredAt),
    atUtc: event.occurredAt.toISOString(),
    ip: event.ip ?? '—',
    hash: event.hash,
  };
}

export async function signatureEvidence(
  tx: TenantTransaction,
  envelope: EnvelopeWithSigners,
  appUrl: string,
): Promise<SignatureEvidence> {
  const [company, events] = await Promise.all([
    companyIdentity(tx),
    envelopeEvents(tx, envelope.id),
  ]);
  const names = new Map(envelope.signers.map((signer) => [signer.id, signer.name]));
  const completed = envelope.completedAt ?? new Date(0);
  return {
    envelopeCode: envelope.code,
    documentCode: envelope.documentCode,
    documentTitle: envelope.documentTitle,
    documentSha256: envelope.documentSha256,
    companyName: `${company.legalName} · NIT ${company.taxId}`,
    verificationCode: envelope.verificationCode ?? '',
    verifyUrl: verifyUrl(appUrl),
    completedAtBogota: bogota(completed),
    completedAtUtc: completed.toISOString(),
    signers: envelope.signers.filter((signer) => signer.status === 'signed').map(signedBy),
    events: events.map((event) => eventLine(event, names)),
  };
}

/** La página de firmas y el certificado, cada uno con el marco institucional. */
export async function evidencePages(
  tx: TenantTransaction,
  evidence: SignatureEvidence,
): Promise<{ readonly signatures: ContractHtml; readonly certificate: ContractHtml }> {
  const company = await companyIdentity(tx);
  const frame = (name: string) => ({
    header: institutionalHeader(
      { code: evidence.envelopeCode, name, version: '01', date: '—' },
      company,
    ),
    footer: institutionalFooter(company, evidence.documentCode),
    landscape: false,
  });
  return {
    signatures: {
      index: printPage(`Firmas ${evidence.documentCode}`, signaturesPageBody(evidence)),
      ...frame('PÁGINA DE FIRMAS'),
    },
    certificate: {
      index: printPage(`Certificado ${evidence.envelopeCode}`, evidenceCertificateBody(evidence)),
      ...frame('CERTIFICADO DE EVIDENCIA'),
    },
  };
}
