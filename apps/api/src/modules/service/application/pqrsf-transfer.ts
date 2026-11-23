import { privacyKindSchema } from '@arza/contracts';

import type { SvcPqrsf } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { receivePqrsfTransfer } from '../../privacy/index.js';
import type { ServiceActor } from './service-support.js';

// Una PQRSF que trata de datos personales pasa a Privacidad en la misma transacción en que se
// clasifica (B29, decisión 5; B42): allí nace la solicitud del titular con su plazo legal y la
// tarea del Oficial de Protección de Datos. La PQRSF sigue su propio trámite en Servicio.

export async function transferToPrivacy(
  tx: TenantTransaction,
  actor: ServiceActor,
  pqrsf: SvcPqrsf,
): Promise<void> {
  if (pqrsf.privacyKind === null) return;
  await receivePqrsfTransfer(tx, actor, {
    code: pqrsf.code,
    privacyKind: privacyKindSchema.parse(pqrsf.privacyKind),
    name: pqrsf.requesterName,
    email: pqrsf.requesterEmail,
    phone: pqrsf.requesterPhone,
    description: `${pqrsf.subject}\n\n${pqrsf.description}`,
    partyId: pqrsf.partyId,
    receivedAt: pqrsf.receivedAt,
  });
}
