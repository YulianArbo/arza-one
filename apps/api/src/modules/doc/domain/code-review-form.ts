import { CODE_REVIEW_CHECKLIST, type FormDefinition } from '@arza/contracts';

import { choice, date, field, long, section, text } from './form-builders.js';

/** Formatos que Proyectos llena con sus datos (B27): el acta de entrega y la revisión de código. */
export const TECHNICAL_DELIVERY_CODE = 'FT-TEC-001';
export const CODE_REVIEW_CODE = 'FT-TEC-002';

/**
 * FT-TEC-002 (B27): la plataforma lo llena con cada revisión de código de un proyecto. Los puntos
 * son los de CODE_REVIEW_CHECKLIST, que la pantalla de la revisión pregunta uno por uno.
 */
export const CODE_REVIEW: FormDefinition = {
  sections: [
    section('general', 'Datos de la revisión', [
      text('proyecto', 'Proyecto', true),
      text('item', 'Ítem revisado', true),
      text('enlace', 'Solicitud de cambios en el repositorio', true),
      text('revisor', 'Revisó', true),
      date('fecha', 'Fecha de la revisión', true),
    ]),
    section('verificacion', 'Verificación', [
      field({
        key: 'puntos',
        label: 'Puntos de la revisión',
        type: 'checklist',
        required: true,
        items: [...CODE_REVIEW_CHECKLIST],
      }),
    ]),
    section('resultado', 'Resultado', [
      choice('resultado', 'Resultado', ['Aprobada', 'Requiere cambios'], true),
      long('observaciones', 'Observaciones'),
    ]),
  ],
};
