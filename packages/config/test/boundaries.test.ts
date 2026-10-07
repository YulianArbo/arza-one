import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { REPO_ROOT, createTempTree, removeTempTree, run } from './support/workspace.js';

const CLI = join(
  dirname(fileURLToPath(import.meta.resolve('dependency-cruiser'))),
  '../../bin/dependency-cruiser.mjs',
);
const CONFIG = join(REPO_ROOT, '.dependency-cruiser.cjs');
const MODULES = 'apps/api/src/modules';

let root = '';

afterEach(() => {
  removeTempTree(root);
});

/** Ejecuta dependency-cruiser con la configuración real del repositorio sobre un árbol temporal. */
function checkBoundaries(files: Record<string, string>): { passed: boolean; output: string } {
  root = createTempTree(files);
  const result = run(process.execPath, [CLI, 'apps', '--config', CONFIG], root);
  return { passed: result.status === 0, output: result.output };
}

describe('fronteras entre módulos', () => {
  it('permite usar otro módulo por su interfaz pública (index.ts)', () => {
    const result = checkBoundaries({
      [`${MODULES}/crm/index.ts`]: 'export const crm = 1;\n',
      [`${MODULES}/finance/application/bill.ts`]:
        "import { crm } from '../../crm/index.js';\nexport const bill = crm;\n",
    });
    expect(result.output).not.toMatch(/error/);
    expect(result.passed).toBe(true);
  });

  it('rechaza importar el interior de otro módulo', () => {
    const result = checkBoundaries({
      [`${MODULES}/crm/domain/quote.ts`]: 'export const quote = 1;\n',
      [`${MODULES}/finance/application/bill.ts`]:
        "import { quote } from '../../crm/domain/quote.js';\nexport const bill = quote;\n",
    });
    expect(result.passed).toBe(false);
    expect(result.output).toContain('no-module-internals');
  });

  it('rechaza que el núcleo dependa de un módulo de negocio', () => {
    const result = checkBoundaries({
      [`${MODULES}/crm/index.ts`]: 'export const crm = 1;\n',
      [`${MODULES}/core/application/setup.ts`]:
        "import { crm } from '../../crm/index.js';\nexport const setup = crm;\n",
    });
    expect(result.passed).toBe(false);
    expect(result.output).toContain('no-core-to-business');
  });
});

describe('dirección de las capas', () => {
  it('rechaza que el dominio dependa de la capa de aplicación', () => {
    const result = checkBoundaries({
      [`${MODULES}/crm/application/create-quote.ts`]: 'export const createQuote = 1;\n',
      [`${MODULES}/crm/domain/quote.ts`]:
        "import { createQuote } from '../application/create-quote.js';\nexport const quote = createQuote;\n",
    });
    expect(result.passed).toBe(false);
    expect(result.output).toContain('no-domain-to-application');
  });

  it('rechaza que el dominio dependa de la infraestructura', () => {
    const result = checkBoundaries({
      [`${MODULES}/crm/infrastructure/quote-repository.ts`]: 'export const repository = 1;\n',
      [`${MODULES}/crm/domain/quote.ts`]:
        "import { repository } from '../infrastructure/quote-repository.js';\nexport const quote = repository;\n",
    });
    expect(result.passed).toBe(false);
    expect(result.output).toContain('no-domain-to-infrastructure');
  });

  it('permite que la infraestructura implemente interfaces del dominio', () => {
    const result = checkBoundaries({
      [`${MODULES}/crm/domain/quote-repository.ts`]: 'export const port = 1;\n',
      [`${MODULES}/crm/infrastructure/prisma-quote-repository.ts`]:
        "import { port } from '../domain/quote-repository.js';\nexport const adapter = port;\n",
    });
    expect(result.output).not.toMatch(/error/);
    expect(result.passed).toBe(true);
  });
});

describe('fronteras entre aplicaciones', () => {
  it('rechaza que la web importe código del backend', () => {
    const result = checkBoundaries({
      'apps/api/src/secret-logic.ts': 'export const logic = 1;\n',
      'apps/web/src/page.ts':
        "import { logic } from '../../api/src/secret-logic.js';\nexport const page = logic;\n",
    });
    expect(result.passed).toBe(false);
    expect(result.output).toContain('no-web-to-backend');
  });
});
