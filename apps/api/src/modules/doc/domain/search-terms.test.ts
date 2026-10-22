import { describe, expect, it } from 'vitest';

import { searchTerms } from './search-terms.js';

describe('términos de la búsqueda', () => {
  it('cada palabra busca también su comienzo, en minúsculas', () => {
    expect(searchTerms('Gestión Documental').query).toBe('gestión:* & documental:*');
  });

  it('quita los operadores y signos que escribe la persona', () => {
    expect(searchTerms("calidad & !(sgc) | 'x':*").query).toBe('calidad:* & sgc:* & x:*');
    expect(searchTerms('&|!()').query).toBeNull();
  });

  it('conserva los guiones de un código y limpia los sobrantes', () => {
    expect(searchTerms('pr-sgc-001').query).toBe('pr-sgc-001:*');
    expect(searchTerms('--pr--sgc--').query).toBe('pr-sgc:*');
  });

  it('un texto con forma de código también busca por el comienzo del código', () => {
    expect(searchTerms(' pr-sgc ').codePrefix).toBe('PR-SGC');
    expect(searchTerms('control de documentos').codePrefix).toBeNull();
    expect(searchTerms('pr%').codePrefix).toBeNull();
  });

  it('toma a lo más diez palabras', () => {
    const many = Array.from({ length: 15 }, (_, i) => `p${String(i)}`).join(' ');
    expect(searchTerms(many).query?.split(' & ')).toHaveLength(10);
  });
});
