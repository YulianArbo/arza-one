import { mockApi, type ApiRoutes } from './support/api-mock';
import { accessibilityViolations, expect, test, useTheme } from './support/fixtures';

// Formatos digitales (B20): lista y ficha de formatos, diseñador, diligenciamiento, registros y
// plantillas de salida, sin violaciones de accesibilidad WCAG 2.2 AA en modo claro y oscuro, y el
// recorrido de diligenciar un formato y guardar su borrador.

const TEMPLATE = '01999a00-0000-7000-8000-00000000e001';
const RECORD = '01999a00-0000-7000-8000-00000000e101';
const OUTPUT = '01999a00-0000-7000-8000-00000000e201';

const field = (key: string, label: string, type: string, extra: object = {}) => ({
  key,
  label,
  type,
  required: false,
  help: null,
  options: [],
  items: [],
  columns: [],
  ...extra,
});

const DEFINITION = {
  sections: [
    {
      key: 'general',
      title: 'Datos generales',
      fields: [
        field('cliente', 'Cliente', 'text', { required: true }),
        field('fecha', 'Fecha de la reunión', 'date'),
        field('decision', 'Decisión', 'select', { options: ['Viable', 'No viable'] }),
        field('acepta', '¿Acepta?', 'boolean'),
      ],
    },
    {
      key: 'detalle',
      title: 'Detalle',
      fields: [
        field('puntos', 'Verificación', 'checklist', { items: ['Código correcto'] }),
        field('compromisos', 'Compromisos', 'table', {
          columns: [{ key: 'actividad', label: 'Actividad', type: 'text' }],
        }),
      ],
    },
  ],
};

const TEMPLATE_VIEW = {
  id: TEMPLATE,
  code: 'FT-COM-002',
  name: 'Acta de Revisión de Requisitos y Arranque',
  form_version: 1,
  status: 'published',
  fill_mode: 'manual',
  workflow_key: 'doc.form_record.direction',
  classification: 'internal',
  entity_type: null,
  field_count: 6,
  published_at: '2026-10-15T15:00:00.000Z',
  version: 2,
  definition: DEFINITION,
  layout: { orientation: 'portrait' },
  document: null,
  output_template: null,
  published_by: { id: '01999a00-0000-7000-8000-00000000a001', name: 'Ana Pérez' },
  actions: ['retire', 'new_version', 'fill'],
};

const RECORD_VIEW = {
  id: RECORD,
  code: 'FT-COM-002-2026-0001',
  status: 'draft',
  template: { id: TEMPLATE, code: 'FT-COM-002', name: TEMPLATE_VIEW.name, form_version: 1 },
  entity: null,
  classification: 'internal',
  created_by: { id: '01999a00-0000-7000-8000-00000000a001', name: 'Ana Pérez' },
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
};

const OUTPUT_VIEW = {
  id: OUTPUT,
  code: 'FT-SGC-001',
  name: 'Solicitud de Acción Documental',
  engine: 'html',
  output_version: 1,
  status: 'published',
  published_at: '2026-10-15T15:00:00.000Z',
  version: 2,
  body: '<p>{{codigo}}</p>',
  file: null,
  variables: ['codigo'],
  published_by: null,
  actions: ['new_version'],
};

const API: ApiRoutes = {
  '/v1/form-templates': { body: { data: [TEMPLATE_VIEW] } },
  [`/v1/form-templates/${TEMPLATE}`]: { body: TEMPLATE_VIEW },
  '/v1/form-records': { body: { data: [RECORD_VIEW], next_cursor: null } },
  [`/v1/form-records/${RECORD}`]: { body: RECORD_VIEW },
  '/v1/output-templates': { body: { data: [OUTPUT_VIEW] } },
  [`/v1/output-templates/${OUTPUT}`]: { body: OUTPUT_VIEW },
};

const PAGES = [
  { path: '/app/documentos/formatos', ready: 'Formatos digitales', name: 'la lista de formatos' },
  {
    path: `/app/documentos/formatos/${TEMPLATE}`,
    ready: 'Vista previa',
    name: 'la ficha del formato',
  },
  { path: '/app/documentos/formatos/nuevo', ready: 'Agregar sección', name: 'el diseñador' },
  {
    path: `/app/documentos/registros/nuevo?formato=${TEMPLATE}`,
    ready: 'Guardar borrador',
    name: 'diligenciar',
  },
  { path: '/app/documentos/registros', ready: 'FT-COM-002-2026-0001', name: 'los registros' },
  { path: `/app/documentos/registros/${RECORD}`, ready: 'Enviar', name: 'la ficha del registro' },
  {
    path: '/app/administracion/plantillas-de-salida',
    ready: 'Nueva plantilla',
    name: 'las plantillas de salida',
  },
] as const;

for (const theme of ['light', 'dark'] as const) {
  test.describe(`formatos digitales en modo ${theme === 'light' ? 'claro' : 'oscuro'}`, () => {
    // Mismo margen que documentos (B18): equipo con poca memoria y servidor recién encendido.
    test.slow();
    for (const page of PAGES) {
      test(`${page.name} no tiene violaciones de accesibilidad`, async ({
        page: browser,
        consoleErrors,
      }) => {
        await useTheme(browser, theme);
        await mockApi(browser, API);
        await browser.goto(page.path);
        await expect(browser.getByText(page.ready, { exact: true }).first()).toBeVisible();
        expect(await accessibilityViolations(browser)).toEqual([]);
        expect(consoleErrors).toEqual([]);
      });
    }
  });
}

test.describe('diligenciar un formato', () => {
  test.slow();
  test('se diligencia con el teclado y el borrador lleva a la ficha del registro', async ({
    page,
    consoleErrors,
  }) => {
    await mockApi(page, {
      [`/v1/form-templates/${TEMPLATE}`]: { body: TEMPLATE_VIEW },
      '/v1/form-records': { status: 201, body: { id: RECORD } },
      [`/v1/form-records/${RECORD}`]: { body: RECORD_VIEW },
    });
    await page.goto(`/app/documentos/registros/nuevo?formato=${TEMPLATE}`);
    await page.getByLabel('Cliente').fill('Cliente Ficticio S.A.S.');
    await page.getByLabel('Decisión').selectOption('Viable');
    await page.getByRole('radio', { name: 'Cumple', exact: true }).check();
    await page.getByRole('button', { name: 'Agregar fila a «Compromisos»' }).click();
    await page.getByLabel('Actividad, fila 1').fill('Enviar cronograma');
    await page.getByRole('button', { name: 'Guardar borrador' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/documentos/registros/${RECORD}$`, 'u'));
    await expect(page.getByRole('heading', { name: /FT-COM-002-2026-0001/u })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});
