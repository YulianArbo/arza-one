import type { LegalTextKey } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { publishedLegalText } from './legal-texts.js';

// Lo que la revisión de puesta en marcha (B45, anexo E punto 12) mira de los textos legales: los
// términos del sitio, los de la plataforma y la política de cookies deben estar publicados con el
// concepto del asesor jurídico adjunto. Los textos de la semilla no lo tienen: son borradores.

const REQUIRED: readonly LegalTextKey[] = ['site_terms', 'platform_terms', 'cookie_policy'];

/** Las clases de texto obligatorias que no tienen una versión publicada con concepto jurídico. */
export async function legalTextsWithoutConcept(tx: TenantTransaction): Promise<LegalTextKey[]> {
  const missing: LegalTextKey[] = [];
  for (const key of REQUIRED) {
    const text = await publishedLegalText(tx, key);
    if ((text?.conceptFileId ?? null) === null) missing.push(key);
  }
  return missing;
}
