import { contractDetailSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { MODIFIED, QUOTE_OPTIONS, contractDetail } from '../../test-support/contract-fixtures';
import {
  EMPTY_VALUES,
  clauseDrafts,
  clauseRequests,
  createBody,
  createProblems,
  isChanged,
  updateProblems,
  valuesFromDetail,
  valuesFromQuote,
} from './contract-form-values';

// Lo que se escribe en el asistente y en la edición del contrato (B24) y el cuerpo que va a la API.

const DETAIL = contractDetailSchema.parse(contractDetail(MODIFIED));

describe('asistente del contrato', () => {
  it('sin datos señala la plantilla, el cliente, las fechas y los textos', () => {
    expect(Object.keys(createProblems(EMPTY_VALUES)).sort()).toEqual(
      expect.arrayContaining([
        'ends_on',
        'object',
        'party_id',
        'starts_on',
        'template_id',
        'title',
      ]),
    );
  });

  it('desde la cotización aceptada trae el cliente, el valor y lo cotizado', () => {
    const values = valuesFromQuote(QUOTE_OPTIONS.quote);
    expect(values).toMatchObject({ partyId: QUOTE_OPTIONS.quote.party.id, value: '960925.00' });
    expect(createBody(values)).toMatchObject({
      quote_id: QUOTE_OPTIONS.quote.id,
      responsible_id: null,
    });
    expect(valuesFromQuote(null)).toBe(EMPTY_VALUES);
  });

  it('avisa si la terminación es anterior al inicio y deja vacío el valor no escrito', () => {
    const values = {
      ...valuesFromQuote(QUOTE_OPTIONS.quote),
      templateId: DETAIL.template.id,
      startsOn: '2026-11-10',
      endsOn: '2026-11-01',
      value: '  ',
      signerName: 'Laura Gómez',
      signerDocument: 'CC 43000000',
    };
    expect(createProblems(values)['ends_on']).toBe(
      'Debe ser igual o posterior a la fecha de inicio.',
    );
    expect(createBody(values)['value']).toBeNull();
  });
});

describe('edición de las cláusulas', () => {
  it('una cláusula sin cambios va sin texto; la cambiada y la nueva llevan el suyo', () => {
    const drafts = clauseDrafts(DETAIL);
    expect(drafts.map(isChanged)).toEqual([false, true, true]);
    const requests = clauseRequests(drafts);
    expect(requests[0]).toEqual({ clause_key: 'partes-contrato', title: 'Partes', body: null });
    expect(requests[1]?.body).toBe('Seis meses de garantía.');
    expect(requests[2]).toMatchObject({ clause_key: null, title: 'Cláusula penal' });
  });

  it('restaurar el texto de la biblioteca deja la cláusula sin cambios', () => {
    const [, guarantee] = clauseDrafts(DETAIL);
    if (guarantee === undefined) throw new Error('Falta la garantía');
    const restored = { ...guarantee, body: guarantee.libraryBody ?? '' };
    expect(isChanged(restored)).toBe(false);
    expect(clauseRequests([restored])[0]?.body).toBeNull();
  });

  it('el borrador completo se valida antes de guardar', () => {
    const values = valuesFromDetail(DETAIL);
    expect(updateProblems(values, clauseRequests(clauseDrafts(DETAIL)))).toEqual({});
    expect(Object.keys(updateProblems({ ...values, title: '' }, []))).toEqual(
      expect.arrayContaining(['title', 'clauses']),
    );
  });
});
