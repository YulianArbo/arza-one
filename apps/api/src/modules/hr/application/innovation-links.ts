import { printedDate } from '@arza/templates';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';

// Lo que Innovación (B40, decisión 8) pide a Talento humano para la cadena de titularidad: el
// contrato laboral firmado de un autor, cuya cláusula cede los derechos patrimoniales a la empresa.
// Solo el código del registro y la fecha de firma: nunca el salario ni el resto del expediente.

export interface SignedEmploymentContract {
  readonly id: string;
  readonly label: string;
}

/** El contrato laboral firmado más reciente de la cuenta, o null si no lo tiene. */
export async function signedEmploymentContractOfUser(
  tx: TenantTransaction,
  userId: string,
): Promise<SignedEmploymentContract | null> {
  const contract = await tx.hrContract.findFirst({
    where: { status: 'signed', deletedAt: null, employee: { userId, deletedAt: null } },
    orderBy: [{ signedOn: 'desc' }, { id: 'desc' }],
    select: { id: true, recordCode: true, signedOn: true },
  });
  if (contract === null) return null;
  const code = contract.recordCode ?? 'Contrato laboral';
  const signed =
    contract.signedOn === null
      ? ''
      : ` firmado el ${printedDate(toCalendarDate(contract.signedOn))}`;
  return { id: contract.id, label: `${code}${signed}` };
}
