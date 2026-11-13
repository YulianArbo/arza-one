import { describe, expect, it } from 'vitest';

import { dateProblem, loanContractData } from './asset-rules.js';

// Reglas de Activos sin base de datos (B34): fechas válidas y los campos del comodato CT-ADM-001.

describe('fechas de los activos', () => {
  const limits = { today: '2026-11-12', notBefore: '2026-01-15' };

  it('acepta hoy, la fecha de compra y cualquier día entre ambas', () => {
    expect(dateProblem('2026-11-12', limits, 'La fecha de baja')).toBeNull();
    expect(dateProblem('2026-01-15', limits, 'La fecha de baja')).toBeNull();
    expect(dateProblem('2026-06-30', { today: '2026-11-12' }, 'La fecha de compra')).toBeNull();
  });

  it('rechaza una fecha futura o anterior a la compra, nombrando el dato', () => {
    expect(dateProblem('2026-11-13', limits, 'La fecha de baja')).toBe(
      'La fecha de baja no puede ser futura.',
    );
    expect(dateProblem('2026-01-14', limits, 'La fecha de entrega')).toBe(
      'La fecha de entrega no puede ser anterior a la fecha de compra del activo.',
    );
  });
});

describe('contrato de comodato CT-ADM-001', () => {
  const input = {
    company: { legalName: 'Empresa de Prueba S.A.S.', taxId: '900123456-7' },
    borrower: { name: 'Ana Gómez', document: 'CC 1020304050' },
    asset: {
      code: 'ACT-2026-0001',
      name: 'Portátil de desarrollo',
      category: 'computer',
      serial: null,
      cost: '3600000.00',
    },
    assignedOn: '2026-11-12',
  };

  it('llena las partes, el activo y las cláusulas con las llaves del formato', () => {
    const data = loanContractData(input);
    expect(data).toMatchObject({
      comodante: 'Empresa de Prueba S.A.S.',
      comodante_nit: '900123456-7',
      comodatario: 'Ana Gómez',
      comodatario_documento: 'CC 1020304050',
      codigo: 'ACT-2026-0001',
      categoria: 'Equipo de cómputo',
      serie: 'No aplica',
      valor: '$ 3600000.00',
      fecha_entrega: '2026-11-12',
    });
    expect(data['clausulas']).toContain('PRIMERA. Objeto');
    expect(data['clausulas']).toContain('CUARTA. Restitución');
  });

  it('muestra la serie si la hay y deja tal cual una categoría desconocida', () => {
    const data = loanContractData({
      ...input,
      asset: { ...input.asset, serial: 'SN-9', category: 'vehiculo' },
    });
    expect(data['serie']).toBe('SN-9');
    expect(data['categoria']).toBe('vehiculo');
  });
});
