import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { componentsOf, isAllowed, runLicenseGate, thirdPartyNotices } from './license-gate.ts';

// Componentes ficticios con la forma de `pnpm licenses list --prod --json -r`.
function component(name: string, license: string) {
  return { name, versions: ['1.0.0'], license, homepage: `https://ejemplo.test/${name}` };
}

describe('licencias aceptadas (B43)', () => {
  it('acepta las permisivas y las de reciprocidad débil de la lista', () => {
    for (const license of ['MIT', 'Apache-2.0', 'ISC', 'BSD-3-Clause', 'MPL-2.0', '0BSD']) {
      expect(isAllowed(license), license).toBe(true);
    }
  });

  it('rechaza las que obligan a publicar el código propio y las desconocidas', () => {
    for (const license of ['GPL-3.0', 'AGPL-3.0-only', 'SSPL-1.0', 'Unknown', '', 'Comercial']) {
      expect(isAllowed(license), license).toBe(false);
    }
  });

  it('con «OR» basta una opción aceptada; con «AND» todas deben serlo', () => {
    expect(isAllowed('(BSD-3-Clause OR GPL-2.0)')).toBe(true);
    expect(isAllowed('(MIT OR GPL-3.0)')).toBe(true);
    expect(isAllowed('(MIT AND Zlib)')).toBe(true);
    expect(isAllowed('MIT and ISC')).toBe(true);
    expect(isAllowed('Apache-2.0 AND LGPL-3.0-or-later')).toBe(true);
    expect(isAllowed('MIT AND GPL-3.0')).toBe(false);
    expect(isAllowed('GPL-2.0 OR AGPL-3.0')).toBe(false);
  });
});

describe('avisos de terceros', () => {
  it('lista cada componente ordenado, con versión, licencia y origen', () => {
    const components = componentsOf({
      MIT: [component('zeta', 'MIT')],
      'Apache-2.0': [component('alfa', 'Apache-2.0')],
    });
    const notices = thirdPartyNotices(components);
    expect(notices).toContain('# Avisos de terceros de ARZA ONE');
    expect(notices.indexOf('- alfa 1.0.0: Apache-2.0')).toBeLessThan(notices.indexOf('- zeta'));
    expect(notices).toContain('— https://ejemplo.test/zeta');
  });
});

describe('verificación de licencias', () => {
  let folder: string;
  let output: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'licencias-'));
    output = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(folder, { recursive: true, force: true });
  });

  function run(report: unknown): number {
    const reportPath = join(folder, 'licencias.json');
    writeFileSync(reportPath, JSON.stringify(report));
    return runLicenseGate(reportPath, join(folder, 'avisos.md'));
  }

  it('pasa con licencias aceptadas y escribe los avisos', () => {
    expect(run({ MIT: [component('uno', 'MIT')] })).toBe(0);
    expect(output).toContain('1 componentes, todos aceptados');
    expect(readFileSync(join(folder, 'avisos.md'), 'utf8')).toContain('- uno 1.0.0: MIT');
  });

  it('falla y nombra el componente con una licencia no aceptada', () => {
    expect(run({ 'AGPL-3.0': [component('copia-fuerte', 'AGPL-3.0')] })).toBe(1);
    expect(output).toContain('copia-fuerte 1.0.0: AGPL-3.0');
  });

  it('se detiene si el informe no tiene la forma esperada', () => {
    expect(run({ MIT: 'no es una lista' })).toBe(2);
  });
});
