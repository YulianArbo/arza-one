import { readFileSync, writeFileSync } from 'node:fs';

import { z } from 'zod';

// Licencias de lo que se entrega (numeral 15.5 «Dependencias comprometidas», B43). Lee el informe
// de `pnpm licenses list --prod --json -r`, falla si un componente trae una licencia que obligue a
// publicar el código de ARZA ONE (GPL, AGPL, SSPL…) o no la declara, y escribe el archivo de avisos
// de terceros que acompaña cada versión.

/**
 * Licencias aceptadas. Permisivas, más tres de reciprocidad débil que solo alcanzan al propio
 * componente usado sin cambios: MPL-2.0 (axe-core), EPL-2.0 y LGPL-3.0 (libvips de sharp, enlazada).
 */
const ALLOWED = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC-BY-4.0',
  'CC0-1.0',
  'EPL-2.0',
  'ISC',
  'LGPL-3.0-or-later',
  'MIT',
  'MIT-0',
  'MPL-2.0',
  'OFL-1.1',
  'PSF-2.0',
  'Unlicense',
  'Zlib',
]);

const componentSchema = z.object({
  name: z.string(),
  versions: z.array(z.string()),
  license: z.string().optional(),
  homepage: z.string().optional(),
  author: z.string().optional(),
});

export const licenseReportSchema = z.record(z.string(), z.array(componentSchema));

export type Component = z.infer<typeof componentSchema> & { readonly expression: string };

/**
 * ¿La expresión de licencia se acepta? «A OR B» basta con una; «A AND B» exige todas. Se aceptan
 * las grafías comunes («MIT and ISC», paréntesis) y se rechaza lo desconocido.
 */
export function isAllowed(expression: string): boolean {
  const normalized = expression.trim().replace(/^\((.*)\)$/, '$1');
  if (normalized === '') return false;
  const options = normalized.split(/\s+OR\s+/i);
  return options.some((option) =>
    option
      .replace(/[()]/g, '')
      .split(/\s+AND\s+/i)
      .every((license) => ALLOWED.has(license.trim())),
  );
}

export function componentsOf(report: z.infer<typeof licenseReportSchema>): Component[] {
  return Object.entries(report)
    .flatMap(([expression, components]) =>
      components.map((component) => ({ ...component, expression })),
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

function noticeLine(component: Component): string {
  const homepage = component.homepage === undefined ? '' : ` — ${component.homepage}`;
  return `- ${component.name} ${component.versions.join(', ')}: ${component.expression}${homepage}`;
}

/** Avisos de terceros: cada componente entregado con su versión, licencia y origen. */
export function thirdPartyNotices(components: readonly Component[]): string {
  return [
    '# Avisos de terceros de ARZA ONE',
    '',
    'ARZA ONE incluye los siguientes componentes de código abierto, cada uno bajo su propia',
    'licencia. El texto completo de cada licencia acompaña al componente en su paquete.',
    '',
    ...components.map(noticeLine),
    '',
  ].join('\n');
}

/** Lee el informe, escribe los avisos y devuelve el código de salida. */
export function runLicenseGate(reportPath: string, noticesPath: string): number {
  const parsed = licenseReportSchema.safeParse(JSON.parse(readFileSync(reportPath, 'utf8')));
  if (!parsed.success) {
    process.stderr.write(`El informe de licencias no tiene la forma esperada: ${reportPath}\n`);
    return 2;
  }
  const components = componentsOf(parsed.data);
  writeFileSync(noticesPath, thirdPartyNotices(components));
  const blocked = components.filter((component) => !isAllowed(component.expression));
  if (blocked.length === 0) {
    process.stdout.write(`Licencias: ${String(components.length)} componentes, todos aceptados.\n`);
    return 0;
  }
  process.stdout.write(
    [
      `Licencias: ${String(blocked.length)} componentes con una licencia no aceptada.`,
      ...blocked.map(noticeLine),
      '',
    ].join('\n'),
  );
  return 1;
}
