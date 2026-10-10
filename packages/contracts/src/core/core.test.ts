import { describe, expect, it } from 'vitest';

import {
  createParameterVersionRequestSchema,
  formatBusinessCode,
  isParameterKey,
  taxIdSchema,
  weeklyHours,
  workScheduleSchema,
} from '../index.js';

const SCHEDULE = {
  days: [1, 2, 3, 4, 5],
  morning: { start: '08:00', end: '12:00' },
  afternoon: { start: '13:00', end: '17:00' },
};

describe('contratos del núcleo', () => {
  it('el horario de lunes a viernes de 8 a 12 y de 1 a 5 suma 40 horas', () => {
    expect(weeklyHours(workScheduleSchema.parse(SCHEDULE))).toBe(40);
  });

  it('rechaza jornadas al revés, que se cruzan o con días repetidos', () => {
    const reversed = { ...SCHEDULE, morning: { start: '12:00', end: '08:00' } };
    const overlapping = { ...SCHEDULE, afternoon: { start: '11:00', end: '17:00' } };
    const repeated = { ...SCHEDULE, days: [1, 1, 2] };
    for (const value of [reversed, overlapping, repeated]) {
      expect(workScheduleSchema.safeParse(value).success).toBe(false);
    }
  });

  it('una vigencia nueva exige fecha de calendario', () => {
    const body = { value: SCHEDULE, valid_from: '2026-11-01' };
    expect(createParameterVersionRequestSchema.safeParse(body).success).toBe(true);
    const withTime = { ...body, valid_from: '2026-11-01T00:00:00Z' };
    expect(createParameterVersionRequestSchema.safeParse(withTime).success).toBe(false);
  });

  it('solo reconoce los parámetros definidos', () => {
    expect(isParameterKey('work.schedule')).toBe(true);
    expect(isParameterKey('toString')).toBe(false);
  });

  it('arma el código PREFIJO-AAAA-NNNN', () => {
    expect(formatBusinessCode('COT', 2026, 7, 4)).toBe('COT-2026-0007');
    expect(formatBusinessCode('PQR', 2027, 12345, 4)).toBe('PQR-2027-12345');
  });

  it('el NIT lleva dígito de verificación', () => {
    expect(taxIdSchema.safeParse('900123456-7').success).toBe(true);
    expect(taxIdSchema.safeParse('900123456').success).toBe(false);
  });
});
