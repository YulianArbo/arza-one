import {
  AMENDMENT_KINDS,
  CONTRACT_KINDS,
  amendmentKindSchema,
  contractKindSchema,
  type SignatureSource,
} from '@arza/contracts';

import type { CtrAmendment, CtrContract } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { contractNotFound, pdfNotReady } from './contract-messages.js';
import { findContract } from './contract-records.js';
import { signatureStatusInvalid } from './signature-messages.js';

// El documento que se firma (B25): el PDF aprobado de un contrato o de un otrosí, con su huella.
// Solo se envía a firma lo aprobado y con su PDF definitivo (ficha 17.7); mientras está en firma,
// el contrato o el otrosí queda «en firma» y no admite la firma manuscrita.

export interface SignableDocument {
  readonly source: SignatureSource;
  readonly contract: CtrContract;
  readonly amendment: CtrAmendment | null;
  readonly fileId: string;
  readonly sha256: string;
  readonly code: string;
  readonly title: string;
  /** Contrato, orden de servicio, otrosí…: lo que ve quien firma. */
  readonly kind: string;
}

function documentOf(contract: CtrContract, amendment: CtrAmendment | null): SignableDocument {
  const record = amendment ?? contract;
  if (record.pdfStatus !== 'ready' || record.pdfFileId === null || record.pdfSha256 === null) {
    throw pdfNotReady();
  }
  return {
    source: amendment === null ? 'contract' : 'amendment',
    contract,
    amendment,
    fileId: record.pdfFileId,
    sha256: record.pdfSha256,
    code: amendment?.code ?? contract.code,
    title: amendment === null ? contract.title : `${amendment.summary} (${contract.code})`,
    kind:
      amendment === null
        ? CONTRACT_KINDS[contractKindSchema.parse(contract.kind)]
        : AMENDMENT_KINDS[amendmentKindSchema.parse(amendment.kind)],
  };
}

/** El documento como está, aprobado o ya en firma, para mostrarlo o seguir su proceso. */
export async function sourceDocument(
  tx: TenantTransaction,
  source: SignatureSource,
  id: string,
): Promise<SignableDocument> {
  if (source === 'contract') return documentOf(await findContract(tx, id), null);
  const amendment = await tx.ctrAmendment.findFirst({ where: { id, deletedAt: null } });
  if (amendment === null) throw contractNotFound('El otrosí');
  return documentOf(await findContract(tx, amendment.contractId), amendment);
}

/**
 * Origen de un proceso que no es un contrato ni un otrosí: el acta de entrega de un proyecto (B27).
 * Proyectos la prepara y sigue su resultado; Contratos no lee las tablas prj_.
 */
export const ACCEPTANCE_SOURCE = 'acceptance';

/** El proceso firma un acta de entrega de un proyecto, no un contrato ni un otrosí. */
export function isAcceptance(envelope: { readonly source: string }): boolean {
  return envelope.source === ACCEPTANCE_SOURCE;
}

/** El documento de un proceso: el contrato y, si lo es, el otrosí. */
export async function envelopeDocument(
  tx: TenantTransaction,
  envelope: { readonly contractId: string | null; readonly amendmentId: string | null },
): Promise<SignableDocument> {
  if (envelope.contractId === null) throw contractNotFound('El contrato');
  return envelope.amendmentId === null
    ? sourceDocument(tx, 'contract', envelope.contractId)
    : sourceDocument(tx, 'amendment', envelope.amendmentId);
}

/** Se puede enviar a firma: está aprobado (el contrato, sin firma registrada; el otrosí, vigente). */
export function assertSignable(document: SignableDocument): void {
  if (document.amendment === null) {
    if (document.contract.status !== 'approved') {
      throw signatureStatusInvalid('Solo se envía a firma un contrato aprobado y sin firmar.');
    }
    return;
  }
  if (document.amendment.status !== 'approved') {
    throw signatureStatusInvalid('Solo se envía a firma un otrosí aprobado y sin firmar.');
  }
  if (!['active', 'expiring'].includes(document.contract.status)) {
    throw signatureStatusInvalid('El otrosí se firma mientras su contrato está vigente.');
  }
}

/** El contrato o el otrosí pasa de aprobado a «en firma», o vuelve a aprobado si no se firmó. */
export async function moveDocument(
  tx: TenantTransaction,
  document: Pick<SignableDocument, 'contract' | 'amendment'>,
  to: 'in_signature' | 'approved',
): Promise<void> {
  const from = to === 'in_signature' ? 'approved' : 'in_signature';
  const { count } =
    document.amendment === null
      ? await tx.ctrContract.updateMany({
          where: { id: document.contract.id, status: from },
          data: { status: to },
        })
      : await tx.ctrAmendment.updateMany({
          where: { id: document.amendment.id, status: from },
          data: { status: to },
        });
  if (count === 0) throw signatureStatusInvalid('El documento cambió mientras tanto. Recargue.');
}
