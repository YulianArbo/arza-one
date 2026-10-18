import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  DESIGNER,
  DRAFT_TEMPLATE_ID,
  OUTPUT_ID,
  TEMPLATE_ID,
  outputOf,
  serveForms,
  templateOf,
} from '../../test-support/form-fixtures';
import { Screen } from '../../test-support/privacy-fixtures';
import { keyFrom } from './design-model';
import { FormDesigner, TemplateDesigner } from './form-designer';

// Diseñador de formatos (B20): secciones y campos sin programar, con nombres internos sugeridos,
// validación antes de guardar y guardado en borrador.

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/documentos/formatos/nuevo',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  push.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderNew(): void {
  renderWithApi(
    <Screen>
      <FormDesigner mode={{ kind: 'new' }} />
    </Screen>,
  );
}

/** La lista «Tipo» del campo número n (desde 0). */
function typeOf(n: number): HTMLElement {
  const select = screen.getAllByLabelText('Tipo').at(n);
  if (select === undefined) throw new Error(`No hay campo ${String(n + 1)}.`);
  return select;
}

/** Agrega un campo a la sección 1 con su etiqueta y su tipo. */
async function addField(position: string, label: string, type: string): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Agregar campo a la sección 1' }));
  await userEvent.type(screen.getByLabelText(`Campo ${position}`), label);
  await userEvent.selectOptions(typeOf(Number(position.split('.')[1]) - 1), type);
}

async function fillGeneral(code: string, name: string, section: string): Promise<void> {
  await userEvent.type(await screen.findByLabelText('Código'), code);
  await userEvent.type(screen.getByLabelText('Nombre'), name);
  await userEvent.type(screen.getByLabelText('Título de la sección 1'), section);
}

const FIELD_BASE = { required: false, help: null, options: [], items: [], columns: [] };
const DECISION_FIELD = {
  ...FIELD_BASE,
  key: 'decision',
  label: 'Decisión',
  type: 'select',
  options: ['Viable', 'No viable'],
};
const DATE_FIELD = {
  ...FIELD_BASE,
  key: 'fecha_de_la_reunion',
  label: 'Fecha de la reunión',
  type: 'date',
  required: true,
};

describe('nombres internos', () => {
  it('salen de la etiqueta, sin tildes, sin repetirse y sin usar los reservados', () => {
    expect(keyFrom('Fecha de la reunión', new Set())).toBe('fecha_de_la_reunion');
    expect(keyFrom('Fecha', new Set(['fecha']))).toBe('fecha_2');
    expect(keyFrom('Empresa', new Set())).toBe('empresa_1');
    expect(keyFrom('1 Punto', new Set())).toBe('c_1_punto');
    expect(keyFrom('¿?', new Set())).toBe('campo');
  });
});

describe('formato nuevo', () => {
  it('arma secciones y campos de cada tipo y los guarda en borrador', async () => {
    const sent = serveForms(DESIGNER, {
      'GET /v1/output-templates': () => json({ data: [outputOf({ status: 'published' })] }),
      'POST /v1/form-templates': () => json({ id: DRAFT_TEMPLATE_ID }, 201),
    });
    renderNew();
    await fillGeneral('ft-com-009', 'Acta de prueba', 'Datos generales');
    const approval = screen.getByLabelText('Aprobación de los registros');
    await userEvent.selectOptions(approval, 'doc.form_record.direction');
    await userEvent.selectOptions(screen.getByLabelText('Plantilla de salida del PDF'), OUTPUT_ID);
    await addField('1.1', 'Fecha de la reunión', 'date');
    expect(screen.getByText('Nombre interno: fecha_de_la_reunion')).toBeVisible();
    await userEvent.click(screen.getByLabelText('Obligatorio'));
    await addField('1.2', 'Decisión', 'select');
    await userEvent.type(screen.getByLabelText('Opciones'), 'Viable{Enter}No viable');
    await userEvent.click(screen.getByRole('button', { name: 'Subir campo 1.2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/documentos/formatos/${DRAFT_TEMPLATE_ID}`);
    });
    const body = sent.find((r) => r.method === 'POST')?.body as Record<string, unknown>;
    const expected = { code: 'FT-COM-009', name: 'Acta de prueba', output_template_id: OUTPUT_ID };
    expect(body).toMatchObject({ ...expected, workflow_key: 'doc.form_record.direction' });
    const fields = [DECISION_FIELD, DATE_FIELD];
    expect(body['definition']).toEqual({
      sections: [{ key: 'datos_generales', title: 'Datos generales', fields }],
    });
  });
});

describe('formato nuevo', () => {
  it('una verificación lleva sus puntos y una tabla sus columnas', async () => {
    const sent = serveForms(DESIGNER, {
      'POST /v1/form-templates': () => json({ id: DRAFT_TEMPLATE_ID }, 201),
    });
    renderNew();
    await fillGeneral('FT-TEC-009', 'Acta de entrega', 'Entrega');
    await addField('1.1', 'Verificación', 'checklist');
    await userEvent.type(screen.getByLabelText('Puntos de verificación'), 'Criterios cumplidos');
    await addField('1.2', 'Entregables', 'table');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar columna' }));
    await userEvent.type(screen.getByLabelText('Nombre de la columna 1'), 'Fecha de entrega');
    await userEvent.selectOptions(screen.getByLabelText('Tipo de la columna 1'), 'date');
    await userEvent.click(screen.getByRole('button', { name: 'Agregar columna' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar columna 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.method === 'POST')).toBe(true);
    });
    const body = sent.find((r) => r.method === 'POST')?.body as {
      definition: { sections: { fields: unknown[] }[] };
    };
    expect(body.definition.sections[0]?.fields).toEqual([
      expect.objectContaining({ type: 'checklist', items: ['Criterios cumplidos'] }),
      expect.objectContaining({
        type: 'table',
        columns: [{ key: 'fecha_de_entrega', label: 'Fecha de entrega', type: 'date' }],
      }),
    ]);
  });
});

describe('formato nuevo', () => {
  it('explica lo que falta antes de guardar', async () => {
    const sent = serveForms(DESIGNER);
    renderNew();
    await userEvent.click(await screen.findByRole('button', { name: 'Agregar sección' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar la sección 2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Agregar campo a la sección 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Quitar campo 1.1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Escriba el código del Listado Maestro');
    expect(alert).toHaveTextContent('Escriba el nombre del formato');
    expect(sent.some((r) => r.method === 'POST')).toBe(false);
  });
});

describe('borrador y versión nueva', () => {
  it('corrige el borrador con PATCH, sin cambiar el código', async () => {
    const sent = serveForms(DESIGNER, {
      [`GET /v1/form-templates/${TEMPLATE_ID}`]: () =>
        json(templateOf({ status: 'draft', actions: ['edit', 'publish'] })),
      [`PATCH /v1/form-templates/${TEMPLATE_ID}`]: () => noContent(),
    });
    renderWithApi(
      <Screen>
        <TemplateDesigner id={TEMPLATE_ID} kind="edit" />
      </Screen>,
    );
    expect(await screen.findByLabelText('Código')).toBeDisabled();
    await userEvent.clear(screen.getByLabelText('Campo 1.1'));
    await userEvent.type(screen.getByLabelText('Campo 1.1'), 'Cliente o prospecto');
    expect(screen.getByText('Nombre interno: cliente')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Bajar campo 1.1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PATCH')?.headers['If-Match']).toBe('"2"');
    });
    expect(push).toHaveBeenCalledWith(`/app/documentos/formatos/${TEMPLATE_ID}`);
  });
});

describe('borrador y versión nueva', () => {
  it('la versión nueva parte de la publicada y se crea con el mismo código', async () => {
    const sent = serveForms(DESIGNER, {
      'POST /v1/form-templates': () => json({ id: DRAFT_TEMPLATE_ID }, 201),
    });
    renderWithApi(
      <Screen>
        <TemplateDesigner id={TEMPLATE_ID} kind="version" />
      </Screen>,
    );
    expect(
      await screen.findByDisplayValue('Acta de Revisión de Requisitos y Arranque'),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({
        code: 'FT-COM-002',
        workflow_key: 'doc.form_record.direction',
      });
    });
  });
});

describe('borrador y versión nueva', () => {
  it('un formato que llena la plataforma no ofrece aprobación ni registro de origen', async () => {
    serveForms(DESIGNER, {
      [`GET /v1/form-templates/${TEMPLATE_ID}`]: () =>
        json(
          templateOf({
            fill_mode: 'system',
            entity_type: 'doc_change_request',
            workflow_key: null,
          }),
        ),
    });
    renderWithApi(
      <Screen>
        <TemplateDesigner id={TEMPLATE_ID} kind="version" />
      </Screen>,
    );
    expect(await screen.findByLabelText('Clasificación')).toBeVisible();
    expect(screen.queryByLabelText('Aprobación de los registros')).toBeNull();
    expect(screen.queryByLabelText('Se une a')).toBeNull();
  });
});
