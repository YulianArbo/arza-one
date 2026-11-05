import { MAX_CLAUSES, unknownVariables } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { SEED_CLAUSES, SEED_TEMPLATES } from './library-seed-data.js';

describe('Biblioteca inicial y plantillas CT-COM y OS-COM', () => {
  const keys = new Set(SEED_CLAUSES.map((clause) => clause.key));

  it('cada cláusula usa solo variables que la plataforma conoce y tiene clave única', () => {
    expect(keys.size).toBe(SEED_CLAUSES.length);
    for (const clause of SEED_CLAUSES) expect(unknownVariables(clause.body)).toEqual([]);
  });

  it('cada plantilla usa cláusulas de la biblioteca, empieza por las partes y cierra con la firma', () => {
    expect(SEED_TEMPLATES.map((template) => template.code)).toEqual([
      'CT-COM-001',
      'CT-COM-002',
      'CT-COM-003',
      'OS-COM-001',
    ]);
    for (const template of SEED_TEMPLATES) {
      const used = template.clauses.map((entry) => entry.replace('?', ''));
      expect(used.every((key) => keys.has(key))).toBe(true);
      expect(used.length).toBeLessThanOrEqual(MAX_CLAUSES);
      expect(used[0]?.startsWith('partes-')).toBe(true);
      // La cláusula de la firma electrónica es obligatoria en todas (numeral 19.4).
      expect(template.clauses.at(-1)).toBe('firma-electronica');
    }
  });
});
