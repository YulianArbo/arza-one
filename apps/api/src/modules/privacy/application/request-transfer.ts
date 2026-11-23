import type { PrivacyKind } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday } from '../../core/index.js';
import { fileRequest } from './request-intake.js';

// Una PQRSF que trata de datos personales pasa a Privacidad (B29, decisión 5; B42): Servicio al
// cliente la clasifica y, en su misma transacción, nace la solicitud del titular con el plazo
// contado desde que llegó la PQRSF. El derecho exacto lo precisa el Oficial al responder.

export interface PqrsfTransfer {
  readonly code: string;
  readonly privacyKind: PrivacyKind;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly description: string;
  readonly partyId: string | null;
  readonly receivedAt: Date;
}

export interface TransferActor {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly meta: RequestMeta | null;
  readonly at: Date;
}

/** Crea la solicitud trasladada; devuelve su código. */
export async function receivePqrsfTransfer(
  tx: TenantTransaction,
  actor: TransferActor,
  pqrsf: PqrsfTransfer,
): Promise<string> {
  const row = await fileRequest(
    tx,
    { ...actor, principal: null },
    {
      channel: 'pqrsf',
      right: pqrsf.privacyKind === 'inquiry' ? 'know' : 'complaint',
      name: pqrsf.name,
      email: pqrsf.email,
      phone: pqrsf.phone,
      documentNumber: null,
      description: pqrsf.description,
      receivedOn: bogotaToday(pqrsf.receivedAt),
      partyId: pqrsf.partyId,
      portalUserId: null,
      sourceCode: pqrsf.code,
      privacyNoticeId: null,
    },
  );
  return row.code;
}
