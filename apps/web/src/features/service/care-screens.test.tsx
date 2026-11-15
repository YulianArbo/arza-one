import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ARTICLE_ID,
  CARE_AGENT,
  KB_READER,
  RESULTS,
  SURVEY_ID,
  articleDetail,
  serveCare,
} from '../../test-support/care-fixtures';
import { Screen } from '../../test-support/core-fixtures';
import { json, noContent, renderWithApi } from '../../test-support/fake-api';
import {
  SERVICE_AGENT,
  TICKET_ID,
  serveService,
  ticketRoute,
} from '../../test-support/service-fixtures';
import { KnowledgeArticle, blocksOf } from './knowledge-article';
import { KnowledgeCreate, KnowledgeEdit } from './knowledge-form';
import { KnowledgeList } from './knowledge-list';
import { ServiceHome } from './service-home';
import { SurveysPage } from './surveys-page';
import { TicketDetailPanel } from './ticket-detail';

// Encuestas y NPS y base de conocimiento (B29). Datos ficticios.

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push, back: vi.fn() }),
  usePathname: () => '/app/servicio',
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
});

function show(ui: ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

describe('encuestas y NPS', () => {
  it('muestra el NPS, la satisfacción y cada respuesta, y filtra por periodo', async () => {
    const sent = serveCare(CARE_AGENT);
    show(<SurveysPage />);
    expect(await screen.findByText('33')).toBeVisible();
    expect(screen.getByText('4,3 / 5')).toBeVisible();
    expect(screen.getByText('3 de 4')).toBeVisible();
    expect(screen.getByText('Muy buena atención.')).toBeVisible();
    expect(screen.getByText('Se envía')).toBeVisible();
    await userEvent.type(screen.getByLabelText('Desde'), '2026-10-01');
    await userEvent.click(screen.getByRole('button', { name: 'Ver' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.search.includes('from=2026-10-01'))).toBe(true);
    });
  });
});

describe('encuestas sin respuestas', () => {
  it('explica cuándo llega la encuesta', async () => {
    serveCare(CARE_AGENT, {
      'GET /v1/survey-responses': () =>
        json({
          ...RESULTS,
          summary: { ...RESULTS.summary, answered: 0, nps: null, satisfaction_avg: null },
          data: [],
        }),
    });
    show(<SurveysPage />);
    expect(await screen.findByText('Nadie ha respondido en este periodo')).toBeVisible();
  });
});

describe('cambiar la encuesta', () => {
  it('guarda los textos y la apaga', async () => {
    const sent = serveCare(CARE_AGENT, { [`PUT /v1/surveys/${SURVEY_ID}`]: () => noContent() });
    show(<SurveysPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Cambiar la encuesta' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText('Nombre de la encuesta'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar la encuesta' }));
    expect(within(dialog).getAllByText('Escriba este texto.').length).toBeGreaterThan(0);
    await userEvent.type(within(dialog).getByLabelText('Nombre de la encuesta'), 'Encuesta');
    await userEvent.click(within(dialog).getByLabelText(/Enviar la encuesta/u));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar la encuesta' }));
    await vi.waitFor(() => {
      expect(sent.find((r) => r.method === 'PUT')?.body).toMatchObject({
        name: 'Encuesta',
        is_active: false,
      });
    });
  });
});

describe('base de conocimiento: lista', () => {
  it('busca y deja escribir a quien administra', async () => {
    const sent = serveCare(CARE_AGENT);
    show(<KnowledgeList />);
    expect(
      await screen.findByRole('link', { name: 'Cómo restablecer su contraseña' }),
    ).toBeVisible();
    expect(
      within(screen.getByRole('list', { name: 'Artículos' })).getByText('Borrador'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Escribir un artículo' })).toBeVisible();
    await userEvent.type(screen.getByLabelText('Buscar en los artículos'), 'clave');
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'draft');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.search.includes('q=clave'))).toBe(true);
    });
  });
});

describe('base de conocimiento: lectores', () => {
  it('quien solo lee llega a la base de conocimiento y no escribe', async () => {
    serveCare(KB_READER, {
      'GET /v1/kb-articles': () => json({ data: [], next_cursor: null, can_manage: false }),
    });
    show(<ServiceHome />);
    expect(await screen.findByText('No hay artículos')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Escribir un artículo' })).toBeNull();
    expect(screen.queryByLabelText('Estado')).toBeNull();
  });
});

describe('artículo', () => {
  it('muestra párrafos y listas, y lo publica', async () => {
    const sent = serveCare(CARE_AGENT, {
      [`POST /v1/kb-articles/${ARTICLE_ID}/actions/publish`]: () => noContent(),
    });
    show(<KnowledgeArticle id={ARTICLE_ID} />);
    expect(await screen.findByText('Abra la página de ingreso.')).toBeVisible();
    expect(screen.getByRole('list')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Editar' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await vi.waitFor(() => {
      expect(sent.some((r) => r.path.endsWith('/actions/publish'))).toBe(true);
    });
  });

  it('separa el texto en párrafos y listas', () => {
    expect(blocksOf('Uno.\n\n- a\n- b\n\nDos\nlíneas.')).toEqual([
      { kind: 'paragraph', text: 'Uno.' },
      { kind: 'list', items: ['a', 'b'] },
      { kind: 'paragraph', text: 'Dos\nlíneas.' },
    ]);
  });
});

describe('artículo publicado, solo lectura', () => {
  it('no ofrece acciones a quien solo lee', async () => {
    serveCare(KB_READER, {
      [`GET /v1/kb-articles/${ARTICLE_ID}`]: () =>
        json(
          articleDetail({
            status: 'published',
            can: { edit: false, publish: false, archive: false },
          }),
        ),
    });
    show(<KnowledgeArticle id={ARTICLE_ID} />);
    expect(await screen.findByText('Publicado')).toBeVisible();
    expect(screen.queryByRole('group', { name: 'Acciones del artículo' })).toBeNull();
  });
});

describe('escribir un artículo', () => {
  it('pide título, resumen y contenido, y abre el artículo', async () => {
    const sent = serveCare(CARE_AGENT, {
      'POST /v1/kb-articles': () => json({ id: ARTICLE_ID }, 201),
    });
    show(<KnowledgeCreate />);
    const submit = await screen.findByRole('button', { name: 'Guardar el artículo' });
    await userEvent.click(submit);
    expect(screen.getAllByText('Escriba un título.').length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText('Título'), 'Facturas');
    await userEvent.type(screen.getByLabelText('Resumen'), 'Cómo llegan las facturas.');
    await userEvent.type(screen.getByLabelText('Contenido'), 'Llegan al correo del cliente.');
    await userEvent.selectOptions(screen.getByLabelText('Para quién es'), 'client');
    await userEvent.click(submit);
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/servicio/conocimiento/${ARTICLE_ID}`);
    });
    expect(sent.find((r) => r.method === 'POST')?.body).toMatchObject({ audience: 'client' });
  });
});

describe('editar un artículo', () => {
  it('parte del artículo y guarda con su versión', async () => {
    const sent = serveCare(CARE_AGENT, {
      [`PUT /v1/kb-articles/${ARTICLE_ID}`]: () => noContent(),
    });
    show(<KnowledgeEdit id={ARTICLE_ID} />);
    expect(await screen.findByDisplayValue('Cómo restablecer su contraseña')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar el artículo' }));
    await vi.waitFor(() => {
      expect(push).toHaveBeenCalledWith(`/app/servicio/conocimiento/${ARTICLE_ID}`);
    });
    expect(sent.find((r) => r.method === 'PUT')?.headers['If-Match']).toBe('"1"');
  });
});

describe('encuesta en la ficha del tiquete', () => {
  it('dice si se respondió y con qué calificaciones', async () => {
    serveService(SERVICE_AGENT, {
      ...ticketRoute({
        status: 'resolved',
        requester_email: 'cliente@ejemplo.test',
        survey: { state: 'answered', score: 9, satisfaction: 4 },
      }),
    });
    show(<TicketDetailPanel id={TICKET_ID} />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Datos' }));
    expect(await screen.findByText(/recomendación 9 de 10, satisfacción 4 de 5/u)).toBeVisible();
    expect(screen.getByText('cliente@ejemplo.test')).toBeVisible();
  });
});
