import { describe, expect, it } from 'vitest';

import {
  createFormRecordSchema,
  createOutputTemplateSchema,
  formDataSchema,
  formDefinitionSchema,
  formFieldSchema,
  formRecordCodeSchema,
  isEmptyValue,
} from '../index.js';

const DEFINITION = formDefinitionSchema.parse({
  sections: [
    {
      key: 'general',
      title: 'Datos generales',
      fields: [
        { key: 'cliente', label: 'Cliente', type: 'text', required: true },
        { key: 'fecha', label: 'Fecha', type: 'date', required: true },
        { key: 'valor', label: 'Valor', type: 'number' },
        { key: 'decision', label: 'Decisión', type: 'select', options: ['Viable', 'No viable'] },
        { key: 'acepta', label: '¿Acepta?', type: 'boolean' },
      ],
    },
    {
      key: 'detalle',
      title: 'Detalle',
      fields: [
        {
          key: 'verificacion',
          label: 'Verificación',
          type: 'checklist',
          required: true,
          items: ['Código correcto', 'Encabezado correcto'],
        },
        {
          key: 'compromisos',
          label: 'Compromisos',
          type: 'table',
          columns: [
            { key: 'actividad', label: 'Actividad', type: 'text' },
            { key: 'fecha', label: 'Fecha', type: 'date' },
          ],
        },
      ],
    },
  ],
});

const COMPLETE = {
  cliente: 'Cliente de prueba S.A.S.',
  fecha: '2026-10-18',
  valor: '1500000,50',
  decision: 'Viable',
  acepta: true,
  verificacion: [
    { result: 'yes', note: '' },
    { result: 'na', note: 'No aplica en este caso' },
  ],
  compromisos: [{ actividad: 'Enviar cronograma', fecha: '2026-10-20' }],
};

describe('diseño del formato', () => {
  it('una lista necesita dos opciones; una verificación, puntos; una tabla, columnas', () => {
    const base = { key: 'campo', label: 'Campo' };
    expect(formFieldSchema.safeParse({ ...base, type: 'select', options: ['A'] }).success).toBe(
      false,
    );
    expect(formFieldSchema.safeParse({ ...base, type: 'checklist' }).success).toBe(false);
    expect(formFieldSchema.safeParse({ ...base, type: 'table' }).success).toBe(false);
    expect(formFieldSchema.safeParse({ ...base, type: 'text', options: ['A'] }).success).toBe(
      false,
    );
  });

  it('el nombre interno de un campo no se repite y usa minúsculas', () => {
    const repeated = {
      sections: [
        { key: 'a', title: 'A', fields: [{ key: 'campo', label: 'Uno', type: 'text' }] },
        { key: 'b', title: 'B', fields: [{ key: 'campo', label: 'Dos', type: 'text' }] },
      ],
    };
    expect(formDefinitionSchema.safeParse(repeated).success).toBe(false);
    const field = { key: 'Campo Uno', label: 'Uno', type: 'text' };
    expect(formFieldSchema.safeParse(field).success).toBe(false);
    const reserved = { key: 'empresa', label: 'Empresa', type: 'text' };
    expect(formFieldSchema.safeParse(reserved).success).toBe(false);
  });
});

describe('datos diligenciados', () => {
  it('un borrador incompleto se guarda; al enviarlo, lo obligatorio debe estar', () => {
    const partial = { cliente: 'Cliente de prueba S.A.S.' };
    expect(formDataSchema(DEFINITION, 'draft').safeParse(partial).success).toBe(true);
    const final = formDataSchema(DEFINITION, 'final').safeParse(partial);
    expect(final.success).toBe(false);
    const paths = final.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['fecha', 'verificacion']));
    expect(formDataSchema(DEFINITION, 'final').safeParse(COMPLETE).success).toBe(true);
  });

  it('una verificación obligatoria exige responder cada punto', () => {
    const unanswered = {
      ...COMPLETE,
      verificacion: [
        { result: 'yes', note: '' },
        { result: null, note: '' },
      ],
    };
    expect(formDataSchema(DEFINITION, 'final').safeParse(unanswered).success).toBe(false);
    expect(formDataSchema(DEFINITION, 'draft').safeParse(unanswered).success).toBe(true);
  });

  it('cada valor respeta su tipo y no se aceptan campos que el formato no tiene', () => {
    const schema = formDataSchema(DEFINITION, 'draft');
    expect(schema.safeParse({ fecha: '18/10/2026' }).success).toBe(false);
    expect(schema.safeParse({ valor: 'mil' }).success).toBe(false);
    expect(schema.safeParse({ decision: 'Tal vez' }).success).toBe(false);
    expect(schema.safeParse({ verificacion: [{ result: 'yes', note: '' }] }).success).toBe(false);
    expect(schema.safeParse({ compromisos: [{ fecha: 'mañana' }] }).success).toBe(false);
    expect(schema.safeParse({ otro: 'x' }).success).toBe(false);
  });

  it('vacío es sin escribir, sin elegir o una tabla sin filas', () => {
    expect(isEmptyValue('')).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(false)).toBe(false);
  });
});

describe('registros y plantillas', () => {
  it('el código del registro sigue al código del formato', () => {
    expect(formRecordCodeSchema.safeParse('FT-COM-002-2026-0001').success).toBe(true);
    expect(formRecordCodeSchema.safeParse('FT-COM-002').success).toBe(false);
  });

  it('un registro unido a otro trae su tipo y su identificador', () => {
    const base = { template_id: '01900000-0000-7000-8000-000000000001' };
    expect(createFormRecordSchema.safeParse({ ...base, entity_type: 'party' }).success).toBe(false);
    expect(createFormRecordSchema.safeParse(base).success).toBe(true);
  });

  it('una plantilla HTML lleva su HTML y una plantilla Word su archivo', () => {
    const base = { code: 'FT-COM-002', name: 'Acta de arranque' };
    const html = { ...base, engine: 'html', body: '<p>{{cliente}}</p>' };
    expect(createOutputTemplateSchema.safeParse(html).success).toBe(true);
    expect(createOutputTemplateSchema.safeParse({ ...html, body: ' ' }).success).toBe(false);
    expect(createOutputTemplateSchema.safeParse({ ...base, engine: 'docx' }).success).toBe(false);
  });
});
