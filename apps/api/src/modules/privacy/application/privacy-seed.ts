import { EDITABLE_NOTICE_KEYS, NOTICE_KINDS, type EditableNoticeKey } from '@arza/contracts';

import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import { createDraft, publishDraft } from './notices.js';
import type { PrivacyActor } from './privacy-support.js';

// Textos de privacidad con los que nace cada empresa (B17). El repositorio no tiene los textos
// oficiales (PL-DG-002 y FT-DG-003), así que se cargan borradores provisionales que el Oficial de
// Protección de Datos reemplaza y publica con el concepto del asesor jurídico (numeral 20.5).
// Mientras no haya uno publicado, ningún formulario con datos personales se puede guardar.

/** Finalidades del catálogo «personal_data_purposes» que cada autorización ofrece. */
const PURPOSES: Readonly<Record<EditableNoticeKey, readonly string[]>> = {
  privacy_policy: [],
  privacy_notice: [],
  authorization_customer: ['COMMERCIAL', 'BILLING', 'SUPPORT', 'MARKETING'],
  authorization_supplier: ['SUPPLIER', 'BILLING'],
  authorization_employee: ['EMPLOYMENT'],
  authorization_candidate: ['RECRUITMENT'],
  authorization_contact: ['COMMERCIAL', 'SUPPORT', 'MARKETING'],
};

function provisionalText(key: EditableNoticeKey) {
  const label = NOTICE_KINDS[key].label;
  return {
    key,
    title: label,
    body:
      `PENDIENTE DE CONCEPTO JURÍDICO. Texto provisional de «${label}» de ARZA TECH S.A.S. ` +
      'Antes de publicarlo en producción debe reemplazarse por el texto oficial (PL-DG-002 y ' +
      'FT-DG-003) aprobado por el asesor jurídico.',
    purposes: [...PURPOSES[key]],
  };
}

function systemActor(tenantId: string, clock: Clock): PrivacyActor {
  return { tenantId, userId: null, principal: null, meta: null, at: clock.now() };
}

/** Un borrador provisional por clase de texto que la empresa todavía no tenga. */
export async function seedPrivacyNotices(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    for (const key of EDITABLE_NOTICE_KEYS) {
      await database.withTenant({ tenantId, userId: null }, async (tx) => {
        if ((await tx.privacyNotice.count({ where: { key } })) > 0) return;
        await createDraft(tx, systemActor(tenantId, clock), provisionalText(key));
      });
    }
  }
}

/** Solo para los datos ficticios: publica los borradores para poder probar los formularios. */
export async function seedPrivacyDemo(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    for (const key of EDITABLE_NOTICE_KEYS) {
      await database.withTenant({ tenantId, userId: null }, async (tx) => {
        const draft = await tx.privacyNotice.findFirst({
          where: { key, status: 'draft', deletedAt: null },
        });
        const published = await tx.privacyNotice.count({ where: { key, status: 'published' } });
        if (draft === null || published > 0) return;
        await publishDraft(tx, systemActor(tenantId, clock), draft);
      });
    }
  }
}
