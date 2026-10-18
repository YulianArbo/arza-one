import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiError, json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  DESIGNER,
  FORM_READER,
  OUTPUT_ID,
  RECORD_ID,
  TEMPLATE_ID,
  VERSION_ID,
  recordOf,
  serveForms,
  templateOf,
} from '../../test-support/form-fixtures';
import { Screen } from '../../test-support/privacy-fixtures';
import { TemplateDetail } from './template-detail';
import { TemplateList } from './template-list';
import { VersionChecklist } from './version-checklist';

// Formatos digitales (B20): lista, ficha con su vista previa y sus pasos, y la lista de
// verificación de una versión en revisión.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => '/app/documentos/formatos',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const TEMPLATE = `GET /v1/form-templates/${TEMPLATE_ID}`;

function renderDetail() {
  return renderWithApi(
    <Screen>
      <TemplateDetail id={TEMPLATE_ID} />
    </Screen>,
  );
}

describe('lista de formatos', () => {
  it('ofrece diligenciar los publicados y oculta los retirados hasta pedirlos', async () => {
    serveForms(DESIGNER);
    renderWithApi(
      <Screen>
        <TemplateList />
      </Screen>,
    );
    expect(await screen.findAllByRole('link', { name: 'FT-COM-002' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Diligenciar' })).toHaveAttribute(
      'href',
      `/app/documentos/registros/nuevo?formato=${TEMPLATE_ID}`,
    );
    expect(screen.getByText('Lo llena la plataforma')).toBeVisible();
    expect(screen.queryByText('FT-SGC-002')).toBeNull();
    await userEvent.click(screen.getByLabelText('Ver también las versiones retiradas'));
    expect(screen.getByText('FT-SGC-002')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nuevo formato' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Plantillas de salida' })).toBeVisible();
  });
});

describe('lista de formatos', () => {
  it('quien solo consulta no diseña ni diligencia; sin formatos lo explica', async () => {
    serveForms(FORM_READER, { 'GET /v1/form-templates': () => json({ data: [] }) });
    renderWithApi(
      <Screen>
        <TemplateList />
      </Screen>,
    );
    expect(await screen.findByText('No hay formatos digitales')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Nuevo formato' })).toBeNull();
  });
});

describe('ficha de un formato', () => {
  it('muestra sus datos y campos, su vista previa y lo deja retirar', async () => {
    const sent = serveForms(DESIGNER, {
      [`POST /v1/form-templates/${TEMPLATE_ID}/actions/retire`]: () => noContent(),
    });
    renderDetail();
    expect(await screen.findByText('Aprobación de Dirección')).toBeVisible();
    expect(screen.getByText(/Fecha de la reunión/u)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Nueva versión' })).toHaveAttribute(
      'href',
      `/app/documentos/formatos/${TEMPLATE_ID}/nueva-version`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Vista previa' }));
    const frame = await screen.findByTitle(
      'Vista previa: FT-COM-002 · Acta de Revisión de Requisitos y Arranque',
    );
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame.getAttribute('srcdoc')).toContain('Código: FT-COM-002');
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, retirar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path.endsWith('/actions/retire'))).toBe(true);
    });
  });
});

describe('ficha de un formato', () => {
  it('el borrador se edita y se publica; un error se muestra', async () => {
    serveForms(DESIGNER, {
      [TEMPLATE]: () =>
        json(
          templateOf({
            status: 'draft',
            published_at: null,
            published_by: null,
            actions: ['edit', 'publish'],
            workflow_key: null,
            entity_type: 'party',
            classification: 'confidential',
            output_template: {
              id: OUTPUT_ID,
              code: 'FT-COM-003',
              name: 'Salida',
              output_version: 2,
            },
            document: { id: VERSION_ID, code: 'FT-COM-003', name: 'Conocimiento del Cliente' },
          }),
        ),
      [`POST /v1/form-templates/${TEMPLATE_ID}/actions/publish`]: () =>
        apiError(409, 'DOC_FORM_TEMPLATE_NOT_EDITABLE', 'Elija una plantilla de salida publicada.'),
    });
    renderDetail();
    expect(await screen.findByText('Sin aprobación: termina al enviarlo')).toBeVisible();
    expect(screen.getByText('Confidencial')).toBeVisible();
    expect(screen.getByText('FT-COM-003 · versión 2')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Editar el borrador' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, publicar' }));
    expect(await screen.findByText('Elija una plantilla de salida publicada.')).toBeVisible();
  });
});

describe('lista de verificación de una versión en revisión', () => {
  it('ofrece diligenciarla y, ya diligenciada, enlaza el registro', async () => {
    serveForms(DESIGNER, {
      'GET /v1/form-templates': () =>
        json({ data: [templateOf({ code: 'FT-SGC-002', entity_type: 'doc_version' })] }),
      'GET /v1/form-records': () => json({ data: [], next_cursor: null }),
    });
    const { unmount } = renderWithApi(
      <Screen>
        <VersionChecklist versionId={VERSION_ID} />
      </Screen>,
    );
    const fill = await screen.findByRole('link', {
      name: 'Diligenciar la Lista de Verificación (FT-SGC-002)',
    });
    expect(fill).toHaveAttribute(
      'href',
      `/app/documentos/registros/nuevo?formato=${TEMPLATE_ID}&tipo=doc_version&registro=${VERSION_ID}`,
    );
    unmount();
    serveForms(DESIGNER, {
      'GET /v1/form-templates': () => json({ data: [templateOf({ code: 'FT-SGC-002' })] }),
      'GET /v1/form-records': () =>
        json({ data: [recordOf({ code: 'FT-SGC-002-2026-0001' })], next_cursor: null }),
    });
    renderWithApi(
      <Screen>
        <VersionChecklist versionId={VERSION_ID} />
      </Screen>,
    );
    expect(await screen.findByRole('link', { name: 'FT-SGC-002-2026-0001' })).toHaveAttribute(
      'href',
      `/app/documentos/registros/${RECORD_ID}`,
    );
    expect(screen.getByText(/Envíela para poder aprobar la revisión/u)).toBeVisible();
  });
});

describe('lista de verificación de una versión en revisión', () => {
  it('sin el formato publicado no muestra nada', async () => {
    serveForms(DESIGNER, { 'GET /v1/form-templates': () => json({ data: [] }) });
    const { container } = renderWithApi(
      <Screen>
        <VersionChecklist versionId={VERSION_ID} />
      </Screen>,
    );
    await vi.waitFor(() => {
      expect(within(container).queryByRole('link')).toBeNull();
    });
  });
});
