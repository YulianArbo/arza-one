// Datos ficticios de las pruebas de las pantallas de formatos digitales (B20). Ninguno es real.

import type { PermissionCode } from '@arza/contracts';

import { SESSION, json, mockApi, type SentRequest } from './fake-api';

export const TEMPLATE_ID = '01999a00-0000-7000-8000-00000000e001';
export const DRAFT_TEMPLATE_ID = '01999a00-0000-7000-8000-00000000e002';
export const RECORD_ID = '01999a00-0000-7000-8000-00000000e101';
export const OUTPUT_ID = '01999a00-0000-7000-8000-00000000e201';
export const PARTY_ID = '01999a00-0000-7000-8000-00000000e301';
export const VERSION_ID = '01999a00-0000-7000-8000-00000000e401';
const DIRECTOR_ID = '01999a00-0000-7000-8000-00000000a003';

function permissions(codes: readonly PermissionCode[]): object {
  return {
    roles: [{ id: '01999a00-0000-7000-8000-00000000c040', code: 'CALIDAD', name: 'Calidad' }],
    permissions: codes.map((code) => ({ code, scope: 'all' })),
  };
}

/** Calidad: diseña formatos, los diligencia y aprueba registros. */
export const DESIGNER = permissions([
  'doc.document.read',
  'doc.form_template.manage',
  'doc.form_record.create',
  'doc.form_record.approve',
  'party.read',
]);

/** Quien solo consulta documentos. */
export const FORM_READER = permissions(['doc.document.read']);

const DEFINITION = {
  sections: [
    {
      key: 'general',
      title: 'Datos generales',
      fields: [
        {
          key: 'cliente',
          label: 'Cliente',
          type: 'text',
          required: true,
          help: null,
          options: [],
          items: [],
          columns: [],
        },
        {
          key: 'fecha',
          label: 'Fecha de la reunión',
          type: 'date',
          required: false,
          help: 'Día de la reunión.',
          options: [],
          items: [],
          columns: [],
        },
        {
          key: 'decision',
          label: 'Decisión',
          type: 'select',
          required: false,
          help: null,
          options: ['Viable', 'No viable'],
          items: [],
          columns: [],
        },
        {
          key: 'acepta',
          label: '¿Acepta?',
          type: 'boolean',
          required: false,
          help: null,
          options: [],
          items: [],
          columns: [],
        },
        {
          key: 'notas',
          label: 'Notas',
          type: 'textarea',
          required: false,
          help: null,
          options: [],
          items: [],
          columns: [],
        },
        {
          key: 'valor',
          label: 'Valor',
          type: 'number',
          required: false,
          help: null,
          options: [],
          items: [],
          columns: [],
        },
      ],
    },
    {
      key: 'detalle',
      title: 'Detalle',
      fields: [
        {
          key: 'puntos',
          label: 'Verificación',
          type: 'checklist',
          required: true,
          help: null,
          options: [],
          items: ['Código correcto'],
          columns: [],
        },
        {
          key: 'compromisos',
          label: 'Compromisos',
          type: 'table',
          required: false,
          help: null,
          options: [],
          items: [],
          columns: [
            { key: 'actividad', label: 'Actividad', type: 'text' },
            { key: 'fecha', label: 'Fecha', type: 'date' },
          ],
        },
      ],
    },
  ],
};

export function templateOf(overrides: object = {}): Record<string, unknown> {
  return {
    id: TEMPLATE_ID,
    code: 'FT-COM-002',
    name: 'Acta de Revisión de Requisitos y Arranque',
    form_version: 1,
    status: 'published',
    fill_mode: 'manual',
    workflow_key: 'doc.form_record.direction',
    classification: 'internal',
    entity_type: null,
    field_count: 8,
    published_at: '2026-10-15T15:00:00.000Z',
    version: 2,
    definition: DEFINITION,
    layout: { orientation: 'portrait' },
    document: null,
    output_template: null,
    published_by: { id: SESSION.user.id, name: 'Ana Pérez' },
    actions: ['retire', 'new_version', 'fill'],
    ...overrides,
  };
}

export function recordOf(overrides: object = {}): Record<string, unknown> {
  return {
    id: RECORD_ID,
    code: 'FT-COM-002-2026-0001',
    status: 'draft',
    template: {
      id: TEMPLATE_ID,
      code: 'FT-COM-002',
      name: 'Acta de Revisión de Requisitos y Arranque',
      form_version: 1,
    },
    entity: null,
    classification: 'internal',
    created_by: { id: SESSION.user.id, name: 'Ana Pérez' },
    created_at: '2026-10-16T14:00:00.000Z',
    submitted_at: null,
    pdf_status: 'none',
    version: 1,
    definition: DEFINITION,
    layout: { orientation: 'portrait' },
    data: { cliente: 'Cliente Ficticio S.A.S.' },
    approved_by: null,
    approved_at: null,
    return_note: null,
    step: null,
    actions: ['edit', 'submit'],
    ...overrides,
  };
}

/** Un registro terminado y aprobado por Dirección, con todos sus valores. */
export const COMPLETED = recordOf({
  status: 'completed',
  pdf_status: 'ready',
  submitted_at: '2026-10-16T15:00:00.000Z',
  approved_by: { id: DIRECTOR_ID, name: 'Laura Díaz' },
  approved_at: '2026-10-16T16:00:00.000Z',
  data: {
    cliente: 'Cliente Ficticio S.A.S.',
    fecha: '2026-10-18',
    acepta: true,
    puntos: [{ result: 'no', note: 'Falta el guion' }],
    compromisos: [{ actividad: 'Enviar cronograma', fecha: '2026-10-20' }],
  },
  actions: ['download'],
});

export function outputOf(overrides: object = {}): Record<string, unknown> {
  return {
    id: OUTPUT_ID,
    code: 'FT-SGC-001',
    name: 'Solicitud de Acción Documental',
    engine: 'html',
    output_version: 1,
    status: 'draft',
    published_at: null,
    version: 1,
    body: '<p>{{codigo}}</p>',
    file: null,
    variables: ['codigo'],
    published_by: null,
    actions: ['edit', 'publish'],
    ...overrides,
  };
}

const PARTIES = {
  data: [
    {
      id: PARTY_ID,
      kind: 'organization',
      name: 'Organización Ficticia S.A.S.',
      id_type: 'NIT',
      id_number: '900000000',
      check_digit: 1,
      email: null,
      phone: null,
      city: null,
      status: 'active',
      roles: ['customer'],
      version: 1,
    },
  ],
  next_cursor: null,
};

const TEMPLATES = {
  data: [
    templateOf(),
    templateOf({
      id: DRAFT_TEMPLATE_ID,
      form_version: 2,
      status: 'draft',
      published_at: null,
    }),
    templateOf({
      id: '01999a00-0000-7000-8000-00000000e003',
      code: 'FT-SGC-002',
      name: 'Lista de Verificación Documental',
      status: 'retired',
      workflow_key: null,
    }),
    templateOf({
      id: '01999a00-0000-7000-8000-00000000e004',
      code: 'FT-SGC-001',
      name: 'Solicitud de Acción Documental',
      fill_mode: 'system',
      workflow_key: null,
    }),
  ],
};

type Routes = Record<string, (request: SentRequest) => Response>;

/** API simulada de formatos con la sesión de Ana y los permisos dados. */
export function serveForms(perms: object, extra: Routes = {}): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(perms),
    'GET /v1/form-templates': () => json(TEMPLATES),
    [`GET /v1/form-templates/${TEMPLATE_ID}`]: () => json(templateOf()),
    [`GET /v1/form-templates/${TEMPLATE_ID}/preview`]: () =>
      json({ html: '<html><body><p>Código: FT-COM-002</p></body></html>' }),
    'GET /v1/form-records': () => json({ data: [recordOf()], next_cursor: null }),
    [`GET /v1/form-records/${RECORD_ID}`]: () => json(recordOf()),
    'GET /v1/output-templates': () => json({ data: [outputOf()] }),
    [`GET /v1/output-templates/${OUTPUT_ID}`]: () => json(outputOf()),
    'GET /v1/parties': () => json(PARTIES),
    ...extra,
  });
}
