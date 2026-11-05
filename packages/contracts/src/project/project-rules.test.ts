import { describe, expect, it } from 'vitest';

import { canMoveItem, hasAtMostDecimals, isWorkItem } from './common.js';
import { moveItemRequestSchema } from './items.js';
import { linkRequestSchema, milestoneRequestSchema } from './planning.js';
import { createProjectRequestSchema } from './projects.js';

// Reglas compartidas de Proyectos (B26, ficha 17.8) que usan la API y el tablero.

describe('mover un ítem en el tablero', () => {
  it('avanza una sola columna y vuelve a cualquiera anterior', () => {
    expect(canMoveItem('pending', 'in_progress')).toBe(true);
    expect(canMoveItem('in_testing', 'done')).toBe(true);
    expect(canMoveItem('done', 'pending')).toBe(true);
    expect(canMoveItem('in_review', 'in_progress')).toBe(true);
  });

  it('no se salta la revisión ni las pruebas, ni se queda donde está', () => {
    expect(canMoveItem('pending', 'in_review')).toBe(false);
    expect(canMoveItem('in_progress', 'done')).toBe(false);
    expect(canMoveItem('in_review', 'in_review')).toBe(false);
  });

  it('las épicas no van al tablero', () => {
    expect(isWorkItem('epic')).toBe(false);
    expect(isWorkItem('defect')).toBe(true);
  });
});

describe('números con decimales', () => {
  it('acepta hasta los decimales pedidos sin tropezar con el redondeo', () => {
    expect(hasAtMostDecimals(120.3, 1)).toBe(true);
    expect(hasAtMostDecimals(33.33, 2)).toBe(true);
    expect(hasAtMostDecimals(0.1 + 0.2, 1)).toBe(true);
    expect(hasAtMostDecimals(12.25, 1)).toBe(false);
  });
});

describe('esquemas', () => {
  it('los enlaces y la revisión de código solo aceptan https', () => {
    const link = { kind: 'repository', label: 'Repositorio' };
    expect(linkRequestSchema.safeParse({ ...link, url: 'https://git.example.com/x' }).success).toBe(
      true,
    );
    expect(linkRequestSchema.safeParse({ ...link, url: 'http://git.example.com/x' }).success).toBe(
      false,
    );
    expect(
      moveItemRequestSchema.safeParse({ status: 'done', review_url: 'javascript:alert(1)' })
        .success,
    ).toBe(false);
  });
});

describe('esquemas de la planeación', () => {
  it('un hito factura de 0 % a 100 % con dos decimales', () => {
    const milestone = { name: 'Entrega 1', due_on: '2026-12-01' };
    expect(milestoneRequestSchema.safeParse({ ...milestone, billing_pct: 33.33 }).success).toBe(
      true,
    );
    expect(milestoneRequestSchema.safeParse({ ...milestone, billing_pct: 100.5 }).success).toBe(
      false,
    );
    expect(milestoneRequestSchema.safeParse({ ...milestone, billing_pct: 10.125 }).success).toBe(
      false,
    );
  });

  it('el proyecto sin contrato ni cliente se valida en la API; las horas llevan un decimal', () => {
    const project = {
      name: 'Portal de clientes',
      type: 'development',
      methodology: 'scrum',
      starts_on: '2026-11-01',
      ends_on: '2027-03-01',
      manager_id: '0190a2c4-0000-7000-8000-000000000001',
    };
    const parsed = createProjectRequestSchema.parse({ ...project, budget_hours: 320.5 });
    expect(parsed).toMatchObject({ contract_id: null, party_id: null, budget_amount: null });
    expect(createProjectRequestSchema.safeParse({ ...project, budget_hours: 3.25 }).success).toBe(
      false,
    );
  });
});
