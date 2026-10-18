import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import { DESIGNER, OUTPUT_ID, outputOf, serveForms } from '../../test-support/form-fixtures';
import { Screen } from '../../test-support/privacy-fixtures';
import { OutputTemplatesPanel } from './output-templates';

// Plantillas de salida (B20): crear una HTML o Word en borrador, corregirla, ver su vista previa,
// publicarla y crear su versión siguiente.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/administracion/plantillas-de-salida',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderPanel() {
  return renderWithApi(
    <Screen>
      <OutputTemplatesPanel />
    </Screen>,
  );
}

describe('plantillas de salida', () => {
  it('crea una plantilla HTML en borrador después de revisar lo que falta', async () => {
    const sent = serveForms(DESIGNER, {
      'POST /v1/output-templates': () => json({ id: OUTPUT_ID }, 201),
    });
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva plantilla' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Escriba el código en mayúsculas');
    await userEvent.type(within(dialog).getByLabelText('Código'), 'ft-com-002');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Acta de arranque');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Escriba el HTML de la plantilla.');
    await userEvent.type(within(dialog).getByLabelText('HTML de la plantilla'), '<p>Hola</p>');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'POST')?.body).toEqual({
        code: 'FT-COM-002',
        engine: 'html',
        name: 'Acta de arranque',
        body: '<p>Hola</p>',
        file_id: null,
      });
    });
  });
});

describe('plantillas de salida', () => {
  it('una plantilla Word pide subir el archivo', async () => {
    serveForms(DESIGNER);
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva plantilla' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Código'), 'ACTA-WORD');
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Acta en Word');
    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'docx');
    expect(within(dialog).getByLabelText('Word de la plantilla (.docx)')).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Suba el Word de la plantilla');
  });
});

describe('plantillas de salida', () => {
  it('el borrador se corrige y se publica; muestra la vista previa', async () => {
    const sent = serveForms(DESIGNER, {
      [`PATCH /v1/output-templates/${OUTPUT_ID}`]: () => noContent(),
      [`POST /v1/output-templates/${OUTPUT_ID}/actions/publish`]: () => noContent(),
      [`GET /v1/output-templates/${OUTPUT_ID}/preview`]: () => json({ html: '<p>[codigo]</p>' }),
    });
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar FT-SGC-001 versión 1' }),
    );
    const dialog = await screen.findByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText('Nombre'));
    await userEvent.type(within(dialog).getByLabelText('Nombre'), 'Solicitud documental');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PATCH')?.body).toEqual({
        name: 'Solicitud documental',
        body: '<p>{{codigo}}</p>',
        file_id: null,
      });
    });
    await userEvent.click(screen.getByRole('button', { name: 'Vista previa' }));
    expect(
      (await screen.findByTitle('Vista previa: FT-SGC-001 versión 1')).getAttribute('srcdoc'),
    ).toBe('<p>[codigo]</p>');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, publicar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path.endsWith('/actions/publish'))).toBe(true);
    });
  });
});

describe('plantillas de salida', () => {
  it('la publicada ofrece su versión siguiente; un error se muestra', async () => {
    serveForms(DESIGNER, {
      [`GET /v1/output-templates/${OUTPUT_ID}`]: () =>
        json(outputOf({ status: 'published', actions: ['new_version'] })),
      'POST /v1/output-templates': () =>
        apiError(422, 'DOC_OUTPUT_TEMPLATE_INVALID', 'La plantilla tiene un error.'),
    });
    renderPanel();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Nueva versión de FT-SGC-001' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Código')).toHaveValue('FT-SGC-001');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar borrador' }));
    expect(await within(dialog).findByText('La plantilla tiene un error.')).toBeVisible();
  });
});

describe('plantillas de salida', () => {
  it('sin plantillas explica que se usa la maqueta institucional', async () => {
    serveForms(DESIGNER, { 'GET /v1/output-templates': () => json({ data: [] }) });
    renderPanel();
    expect(await screen.findByText('No hay plantillas de salida')).toBeVisible();
  });
});
