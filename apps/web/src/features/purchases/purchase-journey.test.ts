import type { PurchaseOrder, PurchaseRequest } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { ORDER, REQUEST } from './purchase-fixtures';
import { purchaseJourney, stageToHighlight } from './purchase-journey';

function request(id: string, status: PurchaseRequest['status']): PurchaseRequest {
  return { ...REQUEST, id, code: `SC-${id}`, status, quotes: [] };
}

function order(id: string, status: PurchaseOrder['status']): PurchaseOrder {
  return { ...ORDER, id, code: `OC-${id}`, status, receipts: [] };
}

describe('recorrido de Compras por etapas (B22B)', () => {
  it('cuenta cada etapa con el estado que ya entrega la API', () => {
    const stages = purchaseJourney(
      [
        request('1', 'in_approval'),
        request('2', 'in_approval'),
        request('3', 'approved'),
        request('4', 'quoted'),
        request('5', 'draft'),
        request('6', 'closed'),
      ],
      [order('7', 'issued'), order('8', 'received'), order('9', 'closed')],
    );
    expect(stages.map((stage) => [stage.key, stage.records.length])).toEqual([
      ['need', 2],
      ['compare', 1],
      ['order', 1],
      ['receive', 1],
    ]);
    expect(stages[3]?.records[0]).toEqual({
      id: '7',
      code: 'OC-7',
      text: 'Sillas ergonómicas de prueba',
    });
  });

  it('destaca la primera etapa con registros, o la primera si todas están vacías', () => {
    expect(stageToHighlight(purchaseJourney([request('1', 'quoted')], []))?.key).toBe('order');
    expect(stageToHighlight(purchaseJourney([], []))?.key).toBe('need');
    expect(stageToHighlight([])).toBeUndefined();
  });
});
