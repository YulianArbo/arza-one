import {
  VIABILITY_CONCEPTS,
  VIABILITY_CRITERIA,
  type CreateFormTemplate,
  type FormDefinition,
} from '@arza/contracts';

import { choice, date, long, section, text } from './form-builders.js';

/** FT-INN-003 (B40, decisión 4): Innovación lo llena con la evaluación de cada idea. */
export const VIABILITY_CODE = 'FT-INN-003';

const SCALE = ['1', '2', '3', '4', '5'];

/**
 * Evaluación de Viabilidad Comercial. Los criterios son los de VIABILITY_CRITERIA, calificados de
 * 1 a 5; borrador por validar contra el formato original.
 */
const VIABILITY: FormDefinition = {
  sections: [
    section('idea', 'Idea evaluada', [
      text('idea', 'Idea', true),
      text('proponente', 'Propuso', true),
      text('evaluador', 'Evaluó', true),
      date('fecha', 'Fecha de la evaluación', true),
    ]),
    section(
      'criterios',
      'Criterios (1 = muy bajo, 5 = muy alto)',
      Object.entries(VIABILITY_CRITERIA).map(([key, label]) => choice(key, label, SCALE, true)),
    ),
    section('resultado', 'Resultado', [
      text('total', 'Puntaje total (de 5 a 25)', true),
      choice('concepto', 'Concepto', Object.values(VIABILITY_CONCEPTS), true),
      long('observaciones', 'Observaciones'),
    ]),
  ],
};

/** La plantilla que la semilla publica en cada empresa: la plataforma la llena (fillMode system). */
export const VIABILITY_TEMPLATE: Omit<CreateFormTemplate, 'output_template_id' | 'document_id'> = {
  code: VIABILITY_CODE,
  name: 'Evaluación de Viabilidad Comercial',
  definition: VIABILITY,
  layout: { orientation: 'portrait' },
  workflow_key: null,
  classification: 'internal',
  entity_type: 'inn_idea',
};
