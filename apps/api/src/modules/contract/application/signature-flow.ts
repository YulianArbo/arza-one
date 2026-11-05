import { HttpStatus } from '@nestjs/common';
import { SIGNATURE_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../../../platform/errors/app-error.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { TransitionNotice, WfContext } from '../../wf/index.js';
import { SIGNATURE_STATES } from '../domain/contract-flows.js';
import { findEnvelope } from './signature-records.js';

// Oyente de la tarea «Firmar … por la empresa» (B25). La firma no se hace desde Mis tareas: allí no
// se confirma que es la persona. La tarea se cierra sola cuando la persona firma desde la ficha, o
// cuando el proceso se rechaza, se anula o vence.

function signInCard(): AppError {
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    SIGNATURE_ERROR_CODES.statusInvalid,
    'Firme desde la ficha del contrato, donde lee el documento y confirma que es usted.',
  );
}

export async function followSignatureFlow(
  tx: TenantTransaction,
  _context: WfContext,
  notice: TransitionNotice,
): Promise<void> {
  const envelope = await findEnvelope(tx, notice.entityId);
  const company = envelope.signers.find((signer) => signer.kind === 'company');
  const signedInCard = company?.status === 'signed';
  if (notice.toState === SIGNATURE_STATES.signed && !signedInCard) throw signInCard();
  if (notice.toState === SIGNATURE_STATES.closed && envelope.status === 'sent') throw signInCard();
}
