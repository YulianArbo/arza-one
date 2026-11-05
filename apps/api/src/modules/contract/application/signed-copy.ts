import type { RegisterSignatureRequest } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { attachedFiles, isAttachableFile } from '../../doc/index.js';
import { datesInvalid, fileInvalid } from './contract-messages.js';

// La copia firmada a mano de un contrato o de un otrosí (B24): un PDF que la persona subió y que pasó
// el antivirus (B14), con una fecha de firma entre la aprobación y hoy. La firma electrónica, con su
// paquete de evidencia, llega con el B25.

export async function assertSignedCopy(
  tx: TenantTransaction,
  principal: Principal,
  input: RegisterSignatureRequest,
  range: { readonly notBefore: string; readonly today: string },
): Promise<void> {
  if (!(await isAttachableFile(tx, principal, input.file_id))) throw fileInvalid();
  const file = (await attachedFiles(tx, [input.file_id])).get(input.file_id);
  if (file?.mime_type !== 'application/pdf') throw fileInvalid();
  if (input.signed_on < range.notBefore || input.signed_on > range.today) {
    throw datesInvalid('La fecha de la firma debe estar entre la aprobación y hoy.');
  }
}
