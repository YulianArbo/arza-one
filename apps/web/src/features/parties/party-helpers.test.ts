import { describe, expect, it } from 'vitest';

import { ORGANIZATION } from '../../test-support/party-fixtures';
import { identification, statusActionLabel } from './labels';
import {
  EMPTY_PARTY,
  createBody,
  duplicateQuery,
  fieldErrors,
  partyBody,
  valuesOf,
} from './party-form-values';
import { queryString } from './queries';

// Lógica de apoyo de las pantallas de terceros (B13).

const detail = { ...ORGANIZATION, kind: 'organization' as const, status: 'active' as const };

describe('textos', () => {
  it('nombra cada cambio de estado y el documento con su dígito', () => {
    expect(statusActionLabel('prospect', 'active')).toBe('Activar');
    expect(statusActionLabel('blocked', 'active')).toBe('Desbloquear');
    expect(statusActionLabel('active', 'inactive')).toBe('Inactivar');
    expect(statusActionLabel('active', 'blocked')).toBe('Bloquear');
    expect(identification(detail)).toBe('NIT 800197268-4');
    expect(identification({ id_type: 'CC', id_number: '123', check_digit: null })).toBe('CC 123');
    const prospect = { id_type: null, id_number: null, check_digit: null };
    expect(identification(prospect)).toBe('Sin documento');
  });

  it('sin número el prospecto va sin documento a la API (B22)', () => {
    const body = partyBody({ ...EMPTY_PARTY, kind: 'person', idType: 'CC', idNumber: '  ' });
    expect(body).toMatchObject({ id_type: null, id_number: null, check_digit: null });
    const prospect = { ...EMPTY_PARTY, kind: 'person' as const, status: 'prospect' as const };
    expect(fieldErrors({ ...prospect, firstName: 'Laura', lastName: 'Gómez' })).toEqual({});
  });

  it('arma los parámetros de la dirección sin los vacíos', () => {
    expect(queryString({ q: ' andina ', role: '', cursor: null, status: undefined })).toBe(
      'q=andina',
    );
  });
});

describe('valores del formulario', () => {
  it('una organización no lleva datos de persona y la persona no lleva razón social', () => {
    const values = valuesOf(detail);
    expect(values.checkDigit).toBe('4');
    expect(
      partyBody({ ...values, kind: 'person', firstName: 'Ana', lastName: 'Ríos' }),
    ).toMatchObject({
      legal_name: null,
      trade_name: null,
      first_name: 'Ana',
      check_digit: 4,
    });
    expect(createBody(values)['consent']).toBeNull();
    expect(partyBody({ ...values, idType: 'CC' })['check_digit']).toBeNull();
  });

  it('da un mensaje en español por cada campo con problemas', () => {
    const errors = fieldErrors({ ...EMPTY_PARTY, email: 'no-es-correo', phone: 'abc' });
    expect(errors['legal_name']).toBe('Este dato es obligatorio.');
    expect(errors['email']).toBe('Escriba un correo válido, por ejemplo nombre@empresa.com.');
    expect(errors['phone']).toBe('Escriba solo números, con el indicativo si es del exterior.');
    expect(errors['id_number']).toBe(
      'Escriba el documento. Solo un prospecto puede quedar sin él.',
    );
    const badNumber = fieldErrors({ ...EMPTY_PARTY, idType: 'CC', idNumber: '12.3' });
    expect(badNumber['id_number']).toBe('Escriba el número de documento: solo letras y números.');
    expect(fieldErrors(valuesOf(detail))).toEqual({});
  });

  it('busca duplicados solo con lo que ya se escribió', () => {
    expect(duplicateQuery(EMPTY_PARTY, null)).toBe('');
    const person = { ...EMPTY_PARTY, kind: 'person' as const, firstName: 'Ana', lastName: 'Ríos' };
    expect(duplicateQuery(person, 'x')).toBe('name=Ana+R%C3%ADos&exclude_id=x');
    expect(duplicateQuery({ ...EMPTY_PARTY, idNumber: 'ab1' }, null)).toBe('id_number=AB1');
  });
});
