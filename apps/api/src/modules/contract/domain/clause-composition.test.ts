import { fitsModel, type ContractClauseRequest, type ContractValues } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import {
  composeClauses,
  CompositionError,
  needsReview,
  templateRequest,
  type LibraryClause,
} from './clause-composition.js';

const VALUES: ContractValues = {
  codigo_contrato: 'CTR-2026-0001',
  empresa_razon_social: 'ARZA TECH S.A.S.',
  empresa_nit: 'NIT 901000000-1',
  cliente_nombre: 'Comercializadora Andina S.A.S.',
  cliente_documento: 'NIT 900123456-7',
  cliente_direccion: 'Calle 10 # 20-30',
  cliente_ciudad: 'Medellín',
  cliente_correo: 'compras@andina.example',
  cliente_representante: 'Laura Gómez',
  cliente_representante_documento: 'CC 43000000',
  objeto: 'desarrollar el portal de clientes',
  valor: '$ 10.000.000,00',
  valor_letras: 'DIEZ MILLONES DE PESOS M/CTE.',
  forma_pago: '50 % al iniciar y 50 % al entregar',
  fecha_inicio: '01/11/2026',
  fecha_fin: '31/10/2027',
  cotizacion: 'COT-2026-0001 versión 1',
};

const LIBRARY = new Map<string, LibraryClause>([
  [
    'partes',
    {
      key: 'partes',
      version: 1,
      title: 'Partes',
      body: 'Entre {{empresa_razon_social}} y {{cliente_nombre}}.',
      numbered: false,
    },
  ],
  [
    'objeto',
    {
      key: 'objeto',
      version: 2,
      title: 'Objeto',
      body: 'EL CONTRATISTA se obliga a {{objeto}}.',
      numbered: true,
    },
  ],
  [
    'garantia',
    {
      key: 'garantia',
      version: 1,
      title: 'Garantía',
      body: 'Tres meses de garantía.',
      numbered: true,
    },
  ],
]);

const TEMPLATE = [
  { key: 'partes', required: true },
  { key: 'objeto', required: true },
  { key: 'garantia', required: false },
];

function problemOf(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error instanceof CompositionError ? error.problem : error;
  }
  return null;
}

describe('Un contrato generado desde la plantilla', () => {
  it('es idéntico al modelo salvo las variables', () => {
    const clauses = composeClauses(templateRequest(TEMPLATE, LIBRARY), TEMPLATE, LIBRARY, VALUES);
    expect(clauses.map((clause) => clause.origin)).toEqual(['library', 'library', 'library']);
    for (const clause of clauses) {
      const model = LIBRARY.get(clause.clauseKey ?? '');
      expect(model).toBeDefined();
      expect(fitsModel(model?.body ?? '', clause.body)).toBe(true);
      expect(clause.title).toBe(model?.title);
    }
    expect(clauses[1]).toMatchObject({
      body: 'EL CONTRATISTA se obliga a desarrollar el portal de clientes.',
      clauseVersion: 2,
      position: 2,
      required: true,
    });
  });
});

describe('Control de cláusulas modificadas', () => {
  it('marca modificada la cláusula cuyo texto o título cambió', () => {
    const requested = templateRequest(TEMPLATE, LIBRARY).map((clause) =>
      clause.clause_key === 'garantia' ? { ...clause, body: 'Seis meses de garantía.' } : clause,
    );
    requested[1] = { clause_key: 'objeto', title: 'Objeto y alcance', body: null };
    const clauses = composeClauses(requested, TEMPLATE, LIBRARY, VALUES);
    expect(clauses.map((clause) => clause.origin)).toEqual(['library', 'modified', 'modified']);
    expect(clauses.filter(needsReview)).toHaveLength(2);
  });

  it('un texto igual al de la biblioteca no cuenta como modificado', () => {
    const requested: ContractClauseRequest[] = [
      {
        clause_key: 'partes',
        title: 'Partes',
        // El mismo texto que sale de la biblioteca, escrito a mano.
        body: 'Entre ARZA TECH S.A.S. y Comercializadora Andina S.A.S..',
      },
      { clause_key: 'objeto', title: 'Objeto', body: null },
    ];
    const clauses = composeClauses(requested, TEMPLATE, LIBRARY, VALUES);
    expect(clauses.every((clause) => clause.origin === 'library')).toBe(true);
  });

  it('una cláusula que no viene de la biblioteca es nueva y también se revisa', () => {
    const requested = [
      ...templateRequest(TEMPLATE, LIBRARY),
      { clause_key: null, title: 'Penal', body: 'Una cláusula penal del 10 % del valor.' },
    ];
    const added = composeClauses(requested, TEMPLATE, LIBRARY, VALUES).at(-1);
    expect(added).toMatchObject({ origin: 'added', clauseKey: null, numbered: true, position: 4 });
    expect(added && needsReview(added)).toBe(true);
  });
});

describe('Lo que no se puede armar', () => {
  it('no se quita una cláusula obligatoria, pero sí una opcional', () => {
    const withoutGuarantee = templateRequest(TEMPLATE, LIBRARY).slice(0, 2);
    expect(composeClauses(withoutGuarantee, TEMPLATE, LIBRARY, VALUES)).toHaveLength(2);
    const withoutObject = templateRequest(TEMPLATE, LIBRARY).filter(
      (c) => c.clause_key !== 'objeto',
    );
    expect(problemOf(() => composeClauses(withoutObject, TEMPLATE, LIBRARY, VALUES))).toEqual({
      kind: 'required',
      title: 'Objeto',
    });
  });

  it('no repite una cláusula ni usa una que no está en la biblioteca', () => {
    const twice = [
      ...templateRequest(TEMPLATE, LIBRARY),
      { clause_key: 'objeto', title: 'Objeto', body: null },
    ];
    expect(problemOf(() => composeClauses(twice, TEMPLATE, LIBRARY, VALUES))).toEqual({
      kind: 'duplicate',
      key: 'objeto',
    });
    const unknown = [
      ...templateRequest(TEMPLATE, LIBRARY),
      { clause_key: 'penal', title: 'Penal', body: null },
    ];
    expect(problemOf(() => composeClauses(unknown, TEMPLATE, LIBRARY, VALUES))).toEqual({
      kind: 'unknown',
      key: 'penal',
    });
    expect(problemOf(() => templateRequest([{ key: 'nada', required: true }], LIBRARY))).toEqual({
      kind: 'unknown',
      key: 'nada',
    });
  });
});
