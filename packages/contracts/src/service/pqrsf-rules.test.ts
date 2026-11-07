import { describe, expect, it } from 'vitest';

import { pqrsfTermsSchema } from '../core/calendar.js';
import { canKbStep } from './knowledge.js';
import {
  canPqrsfStep,
  PQRSF_DEFAULT_TERMS,
  pqrsfCodeSchema,
  pqrsfTermDays,
  publicPqrsfRequestSchema,
} from './pqrsf.js';
import { npsOf, publicSurveyAnswerRequestSchema } from './surveys.js';

const FORM = {
  type: 'complaint',
  name: 'Ana Pérez',
  email: 'Ana@Ejemplo.test',
  subject: 'Demora en la entrega',
  description: 'El entregable llegó dos semanas tarde.',
  accepts_privacy: true,
};

describe('plazos de PQRSF (decisión 2 del B29)', () => {
  it('cada tipo toma su plazo, y los de datos personales el de la Ley 1581', () => {
    expect(pqrsfTermDays(PQRSF_DEFAULT_TERMS, 'petition', null)).toBe(15);
    expect(pqrsfTermDays(PQRSF_DEFAULT_TERMS, 'suggestion', null)).toBe(30);
    expect(pqrsfTermDays(PQRSF_DEFAULT_TERMS, 'petition', 'inquiry')).toBe(10);
    expect(pqrsfTermDays(PQRSF_DEFAULT_TERMS, 'claim', 'claim')).toBe(15);
  });

  it('los plazos por omisión son un parámetro válido; uno de cero días no', () => {
    expect(pqrsfTermsSchema.safeParse(PQRSF_DEFAULT_TERMS).success).toBe(true);
    expect(pqrsfTermsSchema.safeParse({ ...PQRSF_DEFAULT_TERMS, claim: 0 }).success).toBe(false);
    expect(pqrsfTermsSchema.safeParse({ ...PQRSF_DEFAULT_TERMS, extra: 3 }).success).toBe(false);
  });
});

describe('recorrido de la PQRSF', () => {
  it('se clasifica antes de responder y solo se cierra respondida', () => {
    expect(canPqrsfStep('classify', 'filed')).toBe(true);
    expect(canPqrsfStep('draft', 'filed')).toBe(false);
    expect(canPqrsfStep('approve', 'in_progress')).toBe(true);
    expect(canPqrsfStep('close', 'in_progress')).toBe(false);
    expect(canPqrsfStep('close', 'responded')).toBe(true);
  });

  it('un artículo archivado no se edita, pero se puede volver a publicar', () => {
    expect(canKbStep('edit', 'archived')).toBe(false);
    expect(canKbStep('publish', 'archived')).toBe(true);
    expect(canKbStep('archive', 'archived')).toBe(false);
  });
});

describe('formulario público', () => {
  it('pide aceptar el tratamiento de datos y deja vacío el campo trampa', () => {
    const parsed = publicPqrsfRequestSchema.parse(FORM);
    expect(parsed.email).toBe('ana@ejemplo.test');
    expect(parsed.website).toBe('');
    expect(publicPqrsfRequestSchema.safeParse({ ...FORM, accepts_privacy: false }).success).toBe(
      false,
    );
    expect(publicPqrsfRequestSchema.safeParse({ ...FORM, website: 'spam.test' }).success).toBe(
      false,
    );
  });

  it('el radicado se escribe como en el acuse, sin importar mayúsculas', () => {
    expect(pqrsfCodeSchema.parse(' pqrsf-2026-0007 ')).toBe('PQRSF-2026-0007');
    expect(pqrsfCodeSchema.safeParse('TIQ-2026-0007').success).toBe(false);
  });
});

describe('NPS', () => {
  it('es el porcentaje de promotores menos el de detractores', () => {
    expect(npsOf([])).toBeNull();
    expect(npsOf([10, 9, 8, 7, 6])).toBe(20);
    expect(npsOf([0, 3, 6])).toBe(-100);
    expect(npsOf([9, 10, 7])).toBe(67);
  });

  it('la recomendación va de 0 a 10 y la satisfacción de 1 a 5', () => {
    const answer = { token: 'x'.repeat(43), score: 10, satisfaction: 5 };
    expect(publicSurveyAnswerRequestSchema.parse(answer).comment).toBeNull();
    expect(publicSurveyAnswerRequestSchema.safeParse({ ...answer, score: 11 }).success).toBe(false);
    expect(publicSurveyAnswerRequestSchema.safeParse({ ...answer, satisfaction: 0 }).success).toBe(
      false,
    );
  });
});
