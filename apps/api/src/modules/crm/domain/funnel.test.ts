import { describe, expect, it } from 'vitest';

import { funnelCsv } from './funnel-csv.js';
import { funnelReport, type FunnelOpportunity } from './funnel.js';
import { moneyText, percent, sumMoney, weightedValue } from './money.js';

// Informe del embudo, RE-COM-001 (B22): los totales coinciden con el cálculo a mano, al centavo.

function opportunity(overrides: Partial<FunnelOpportunity>): FunnelOpportunity {
  return {
    code: 'OPO-2026-0001',
    createdOn: '2026-10-01',
    client: 'Andina S.A.S.',
    title: 'Portal de clientes',
    stage: 'prospecting',
    estimatedValue: '1000000.00',
    probability: 10,
    expectedClose: '2026-12-15',
    owner: 'Ana Gómez',
    lostReason: null,
    closedOn: null,
    ...overrides,
  };
}

const PRICE = { code: 'PRICE', label: 'Precio' };

const SAMPLE = [
  opportunity({ code: 'OPO-2026-0001', estimatedValue: '1000000.00', probability: 10 }),
  opportunity({
    code: 'OPO-2026-0002',
    stage: 'proposal',
    estimatedValue: '2500000.55',
    probability: 50,
  }),
  opportunity({
    code: 'OPO-2026-0003',
    stage: 'won',
    estimatedValue: '4000000.00',
    probability: 100,
    closedOn: '2026-10-20',
  }),
  opportunity({
    code: 'OPO-2026-0004',
    stage: 'lost',
    estimatedValue: '300000.10',
    probability: 0,
    lostReason: PRICE,
    closedOn: '2026-10-21',
  }),
];

describe('dinero del CRM', () => {
  it('pondera y suma al centavo, con la mitad hacia arriba', () => {
    expect(weightedValue('2500000.55', 50)).toBe('1250000.28');
    expect(weightedValue('0.01', 50)).toBe('0.01');
    expect(weightedValue('999.99', 33)).toBe('330.00');
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30');
    expect(moneyText('1500000.5')).toBe('1500000.50');
  });
});

describe('dinero del CRM', () => {
  it('el porcentaje lleva un decimal y no existe sin base', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(2, 3)).toBe(66.7);
    expect(percent(0, 0)).toBeNull();
  });
});

const report = funnelReport(SAMPLE, { count: 8, converted: 3 }, new Date('2026-10-22T15:00:00Z'));

describe('informe del embudo', () => {
  it('cuenta y suma cada etapa', () => {
    const proposal = report.stages.find((stage) => stage.stage === 'proposal');
    expect(proposal).toEqual({
      stage: 'proposal',
      label: 'Propuesta',
      count: 1,
      value: '2500000.55',
      weighted_value: '1250000.28',
    });
    expect(report.stages.map((stage) => stage.count)).toEqual([1, 0, 1, 0, 1, 1]);
  });
});

describe('informe del embudo', () => {
  it('los totales coinciden con el cálculo a mano', () => {
    expect(report.totals).toEqual({
      open_count: 2,
      open_value: '3500000.55',
      // 1.000.000 × 10 % + 2.500.000,55 × 50 % = 100.000 + 1.250.000,28
      weighted_value: '1350000.28',
      won_count: 1,
      won_value: '4000000.00',
      lost_count: 1,
      lost_value: '300000.10',
      win_rate: 50,
      leads_count: 8,
      converted_leads: 3,
      lead_conversion_rate: 37.5,
    });
  });
});

describe('informe del embudo', () => {
  it('agrupa los motivos de pérdida', () => {
    expect(report.lost_reasons).toEqual([{ ...PRICE, count: 1, value: '300000.10' }]);
  });
});

describe('informe del embudo', () => {
  it('cada fila del registro lleva su estado y su valor ponderado', () => {
    expect(report.rows.map((row) => [row.code, row.status, row.weighted_value])).toEqual([
      ['OPO-2026-0001', 'open', '100000.00'],
      ['OPO-2026-0002', 'open', '1250000.28'],
      ['OPO-2026-0003', 'won', '4000000.00'],
      ['OPO-2026-0004', 'lost', '0.00'],
    ]);
  });
});

describe('informe del embudo', () => {
  it('sin oportunidades cerradas no hay tasa de cierre', () => {
    const empty = funnelReport([], { count: 0, converted: 0 }, new Date());
    expect(empty.totals).toMatchObject({ win_rate: null, lead_conversion_rate: null });
    expect(empty.totals.open_value).toBe('0.00');
  });
});

describe('RE-COM-001 en CSV', () => {
  it('va con punto y coma, fechas dd/mm/aaaa y pesos con coma decimal (entre comillas)', () => {
    const report = funnelReport(SAMPLE, { count: 4, converted: 1 }, new Date());
    const lines = funnelCsv(report).replace('﻿', '').split('\r\n');
    expect(lines[0]).toBe(
      'Código;Fecha de creación;Cliente;Oportunidad;Etapa;Valor estimado;Probabilidad (%);Valor ponderado;Fecha esperada de cierre;Responsable;Estado;Motivo de pérdida;Fecha de cierre',
    );
    expect(lines[4]).toBe(
      'OPO-2026-0004;01/10/2026;Andina S.A.S.;Portal de clientes;Perdida;"300000,10";0;"0,00";15/12/2026;Ana Gómez;Perdida;Precio;21/10/2026',
    );
  });
});
