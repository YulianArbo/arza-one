import {
  framedPreview,
  institutionalFooter,
  institutionalHeader,
  printedDate,
  type DocumentIdentity,
} from '@arza/templates';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { bogotaToday, companyIdentity } from '../../core/index.js';

// Vista previa en pantalla de un formato o de una plantilla de salida (B20): la página con el
// encabezado y el pie institucionales, como se verá la primera hoja del PDF.

/** Lo que se muestra del documento antes de publicarlo; la fecha es la de hoy. */
export type PreviewIdentity = Omit<DocumentIdentity, 'date'>;

export async function previewPage(
  tx: TenantTransaction,
  identity: PreviewIdentity,
  page: { readonly html: string; readonly at: Date },
): Promise<string> {
  const company = await companyIdentity(tx);
  const document = { ...identity, date: printedDate(bogotaToday(page.at)) };
  return framedPreview({
    header: institutionalHeader(document, company),
    page: page.html,
    footer: institutionalFooter(company, null),
  });
}

/** Valores de ejemplo: cada variable muestra su propio nombre entre corchetes. */
export function sampleContext(
  variables: readonly string[],
  identity: PreviewIdentity,
): Record<string, unknown> {
  return {
    ...Object.fromEntries(variables.map((name) => [name, `[${name}]`])),
    formato: {
      codigo: identity.code,
      nombre: identity.name,
      version: identity.version,
      fecha: '[fecha]',
    },
    registro: {
      codigo: `${identity.code}-AAAA-0001`,
      estado: '[estado]',
      elaboro: '[quien diligenció]',
      fecha: '[fecha]',
      aprobo: '[quien aprobó]',
      fecha_aprobacion: '[fecha de aprobación]',
    },
    empresa: { razon_social: '[razón social]', nit: '[NIT]' },
  };
}
