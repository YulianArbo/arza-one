import type { PurchaseTiers } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import {
  approvalAmountOf,
  canApproveTier,
  quoteSelectionOutcome,
  receiptDateProblem,
} from './purchase-rules.js';

const TIERS: PurchaseTiers = {
  low_limit: '1000000.00',
  mid_limit: '10000000.00',
  quotes_low: 1,
  quotes_mid: 2,
  quotes_high: 3,
};

describe('aprobación por montos', () => {
  it('manda el valor de la cotización elegida y, si no hay, el estimado', () => {
    expect(approvalAmountOf('500000.00', null)).toBe('500000.00');
    expect(approvalAmountOf('500000.00', '12000000.00')).toBe('12000000.00');
  });

  it('el tramo alto lo aprueba solo la Dirección', () => {
    expect(canApproveTier('low', false)).toBe(true);
    expect(canApproveTier('mid', false)).toBe(true);
    expect(canApproveTier('high', false)).toBe(false);
    expect(canApproveTier('high', true)).toBe(true);
  });
});

describe('elegir una cotización en el cuadro comparativo', () => {
  const base = { approvedAmount: '5000000.00', tiers: TIERS };

  it('no avanza sin las cotizaciones que exige el tramo', () => {
    expect(quoteSelectionOutcome({ ...base, quoteAmount: '4800000.00', quoteCount: 1 })).toEqual({
      kind: 'quotes_missing',
      required: 2,
    });
    expect(quoteSelectionOutcome({ ...base, quoteAmount: '11000000.00', quoteCount: 2 })).toEqual({
      kind: 'quotes_missing',
      required: 3,
    });
  });

  it('queda cotizada si el valor sigue en el tramo aprobado o en uno menor', () => {
    expect(quoteSelectionOutcome({ ...base, quoteAmount: '9000000.00', quoteCount: 2 })).toEqual({
      kind: 'quoted',
    });
    expect(quoteSelectionOutcome({ ...base, quoteAmount: '800000.00', quoteCount: 1 })).toEqual({
      kind: 'quoted',
    });
  });

  it('vuelve a aprobación si la cotización sube de tramo', () => {
    expect(quoteSelectionOutcome({ ...base, quoteAmount: '10000000.01', quoteCount: 3 })).toEqual({
      kind: 'needs_approval',
    });
  });
});

describe('fecha de la recepción', () => {
  it('no admite fechas futuras ni anteriores a la orden', () => {
    expect(receiptDateProblem('2026-11-13', '2026-11-10', '2026-11-12')).toBe('future');
    expect(receiptDateProblem('2026-11-09', '2026-11-10', '2026-11-12')).toBe('before_order');
    expect(receiptDateProblem('2026-11-10', '2026-11-10', '2026-11-12')).toBeNull();
  });
});
