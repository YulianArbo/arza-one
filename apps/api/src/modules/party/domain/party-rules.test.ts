import { describe, expect, it } from 'vitest';

import { duplicateReasons, normalizeName, normalizePhone } from './duplicates.js';
import { contactMergePlan, mergeProblem, roleMergePlan } from './merge.js';
import { defaultNextReview, dueDiligenceState, reviewProblem } from './reviews.js';

// Reglas de terceros (ficha 17.3) que no dependen de la base de datos.

const ANDINA = {
  idNumber: '900123456',
  name: 'Comercializadora Andina S.A.S.',
  email: 'compras@andina.example',
  phone: '+57 310 555 1234',
};

describe('posibles duplicados', () => {
  it('compara nombres sin tildes, mayúsculas, puntos ni forma jurídica', () => {
    expect(normalizeName('Comercializadora Andina S.A.S.')).toBe('comercializadora andina');
    expect(normalizeName('COMERCIALIZADORA  ANDÍNA sas')).toBe('comercializadora andina');
    expect(normalizeName('Muñoz & Cía. Ltda')).toBe('munoz');
  });

  it('compara teléfonos por sus diez últimos dígitos', () => {
    expect(normalizePhone('+57 310 555 1234')).toBe('3105551234');
    expect(normalizePhone('310 5551234')).toBe('3105551234');
  });

  it('da todas las razones que coinciden', () => {
    const probe = {
      idNumber: '900123456',
      name: 'comercializadora andina',
      email: 'COMPRAS@andina.example ',
      phone: '3105551234',
    };
    expect(duplicateReasons(probe, ANDINA)).toEqual(['id_number', 'email', 'phone', 'name']);
  });

  it('no confunde a quien no coincide ni compara datos vacíos', () => {
    const probe = { name: 'Andina Logística', phone: '' };
    expect(duplicateReasons(probe, { ...ANDINA, phone: null })).toEqual([]);
    expect(duplicateReasons({ name: 'S.A.S.' }, { ...ANDINA, name: 'Ltda' })).toEqual([]);
  });
});

describe('fusión de duplicados', () => {
  it('solo fusiona dos terceros distintos del mismo tipo', () => {
    const org = { id: 'a', kind: 'organization' };
    expect(mergeProblem(org, org)).toBe('same_party');
    expect(mergeProblem(org, { id: 'b', kind: 'person' })).toBe('different_kind');
    expect(mergeProblem(org, { id: 'b', kind: 'organization' })).toBeNull();
  });

  it('pasa los papeles nuevos, retira los repetidos y reactiva los que seguían vigentes', () => {
    const survivor = [
      { id: 's1', role: 'customer', status: 'active' },
      { id: 's2', role: 'supplier', status: 'ended' },
    ];
    const duplicate = [
      { id: 'd1', role: 'customer', status: 'active' },
      { id: 'd2', role: 'supplier', status: 'active' },
      { id: 'd3', role: 'contact', status: 'ended' },
    ];
    expect(roleMergePlan(survivor, duplicate)).toEqual({
      move: ['d3'],
      retire: ['d1', 'd2'],
      reactivate: ['s2'],
    });
  });

  it('reasigna los contactos sin repetir parejas ni dejar al tercero como contacto de sí mismo', () => {
    const contacts = [
      { id: 'c1', organizationId: 'org-dup', personId: 'ana' },
      { id: 'c2', organizationId: 'org-keep', personId: 'ana' },
      { id: 'c3', organizationId: 'org-dup', personId: 'luis' },
    ];
    expect(contactMergePlan('org-keep', 'org-dup', contacts)).toEqual({
      move: ['c3'],
      retire: ['c1'],
    });
    const asPerson = [{ id: 'c4', organizationId: 'keep', personId: 'dup' }];
    expect(contactMergePlan('keep', 'dup', asPerson)).toEqual({ move: [], retire: ['c4'] });
  });
});

describe('conocimiento del tercero', () => {
  it('la próxima revisión es a doce meses, también desde un 29 de febrero', () => {
    expect(defaultNextReview('2026-10-10')).toBe('2027-10-10');
    expect(defaultNextReview('2028-02-29')).toBe('2029-02-28');
  });

  it('una aprobación vencida deja de valer', () => {
    const approved = { status: 'approved', nextReviewOn: '2027-01-31' };
    expect(dueDiligenceState(null, '2026-10-10')).toBe('none');
    expect(dueDiligenceState(approved, '2027-01-31')).toBe('approved');
    expect(dueDiligenceState(approved, '2027-02-01')).toBe('expired');
    expect(dueDiligenceState({ status: 'pending', nextReviewOn: null }, '2026-10-10')).toBe(
      'pending',
    );
  });

  it('nadie aprueba lo que registró ni una revisión cerrada', () => {
    expect(reviewProblem({ status: 'pending', createdBy: 'ana' }, 'ana')).toBe('same_person');
    expect(reviewProblem({ status: 'approved', createdBy: 'ana' }, 'luis')).toBe('closed');
    expect(reviewProblem({ status: 'pending', createdBy: 'ana' }, 'luis')).toBeNull();
  });
});
