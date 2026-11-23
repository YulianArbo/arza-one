import type { CookieCategory } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { auditPrivacy, type PrivacyActor } from './privacy-support.js';

// Elección de cookies de los visitantes del sitio (numeral 20.4; B41, decisión 4). Se registra con
// la versión de la política, la fecha, las categorías y un identificador aleatorio del navegador;
// la dirección IP llega ya truncada y así queda también en la auditoría. Solo se agrega.

export interface CookieConsentInput {
  readonly visitorId: string;
  readonly policyVersion: number;
  readonly categories: readonly CookieCategory[];
  readonly ipTruncated: string | null;
}

export async function recordCookieConsent(
  tx: TenantTransaction,
  actor: PrivacyActor,
  input: CookieConsentInput,
): Promise<Date> {
  const categories = ['necessary', ...input.categories.filter((item) => item !== 'necessary')];
  const row = await tx.privacyCookieConsent.create({
    data: {
      tenantId: actor.tenantId,
      visitorId: input.visitorId,
      policyVersion: input.policyVersion,
      categories,
      decidedAt: actor.at,
      ipTruncated: input.ipTruncated,
    },
  });
  await auditPrivacy(tx, actor, {
    action: 'privacy.cookie_consent.record',
    entityType: 'prv_cookie_consent',
    entityId: row.id,
    changes: { policy_version: input.policyVersion, categories },
  });
  return row.decidedAt;
}
