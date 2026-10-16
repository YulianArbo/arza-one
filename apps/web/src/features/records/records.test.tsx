import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SESSION,
  apiError,
  json,
  mockApi,
  noContent,
  renderWithApi,
} from '../../test-support/fake-api';
import {
  ATTACHMENT_ID,
  COMMENT_ID,
  FILE_ID,
  PARTY_ID,
  attachment,
  availableFile,
  comment,
  permissions,
} from '../../test-support/ntf-fixtures';
import { RequireSession } from '../session/session-provider';
import { emailsOf } from './comments-panel';
import { RecordActivity } from './record-activity';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/terceros',
}));

const RECORD = { entity_type: 'party', entity_id: PARTY_ID } as const;
const LINK = 'http://api.test/v1/files/downloads/llave';

function Screen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="internal">{children}</RequireSession>;
}

function serve(
  codes: Parameters<typeof permissions>[0],
  extra: Parameters<typeof mockApi>[0] = {},
) {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions(codes)),
    'GET /v1/comments': () => json({ items: [comment()] }),
    'POST /v1/comments': () => json({ id: COMMENT_ID }, 201),
    [`DELETE /v1/comments/${COMMENT_ID}`]: () => noContent(),
    'GET /v1/attachments': () => json({ items: [attachment()] }),
    'POST /v1/attachments': () => json({ id: ATTACHMENT_ID }, 201),
    [`POST /v1/attachments/${ATTACHMENT_ID}/download-link`]: () =>
      json({ url: LINK, expires_at: '2026-10-13T14:35:00.000Z' }),
    'GET /v1/files': () => json({ data: [availableFile()] }),
    ...extra,
  });
}

function show(): void {
  renderWithApi(
    <Screen>
      <RecordActivity record={RECORD} writePermissions={['party.update']} />
    </Screen>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('menciones', () => {
  it('lee los correos separados por comas, espacios o punto y coma', () => {
    expect(emailsOf(' ana@x.co, luis@x.co;pia@x.co  ')).toEqual([
      'ana@x.co',
      'luis@x.co',
      'pia@x.co',
    ]);
    expect(emailsOf('   ')).toEqual([]);
  });
});

describe('comentarios de un registro', () => {
  it('muestra los comentarios y comenta mencionando por correo', async () => {
    const sent = serve(['party.update']);
    show();
    expect(await screen.findByText('Revisé el RUT y está al día.')).toBeVisible();
    expect(screen.getByText('Menciona a Luis Gómez')).toBeVisible();
    await userEvent.type(screen.getByRole('textbox', { name: 'Comentario' }), 'Listo para aprobar');
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Mencionar (opcional)' }),
      'luis@demo-uno.test',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }));
    await waitFor(() => {
      expect(
        sent.find((request) => request.method === 'POST' && request.path === '/v1/comments')?.body,
      ).toEqual({
        ...RECORD,
        body: 'Listo para aprobar',
        mention_emails: ['luis@demo-uno.test'],
      });
    });
  });

  it('retira el comentario propio y muestra el error de una mención inválida', async () => {
    const sent = serve(['party.update'], {
      'POST /v1/comments': () =>
        apiError(422, 'NTF_MENTION_INVALID', 'Solo puede mencionar a colaboradores activos.'),
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar mi comentario' }));
    await waitFor(() => {
      expect(sent.some((request) => request.method === 'DELETE')).toBe(true);
    });
    await userEvent.type(screen.getByRole('textbox', { name: 'Comentario' }), 'Hola');
    await userEvent.click(screen.getByRole('button', { name: 'Comentar' }));
    expect(await screen.findByText('Solo puede mencionar a colaboradores activos.')).toBeVisible();
  });
});

describe('comentarios: solo lectura', () => {
  it('quien solo lee no ve el formulario; sin comentarios lo dice', async () => {
    serve(['party.read'], { 'GET /v1/comments': () => json({ items: [] }) });
    show();
    expect(await screen.findByText('Sin comentarios')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Comentar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Adjuntar un archivo' })).not.toBeInTheDocument();
  });
});

describe('adjuntos de un registro', () => {
  it('descarga un adjunto por su enlace de cinco minutos', async () => {
    serve(['party.update', 'doc.document.read']);
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    show();
    expect(await screen.findByText('RUT 2026')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Retirar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Descargar' }));
    await waitFor(() => {
      expect(open).toHaveBeenCalledWith(LINK, '_self');
    });
  });

  it('adjunta uno de sus archivos ya revisados', async () => {
    const sent = serve(['party.update', 'doc.document.read'], {
      'GET /v1/attachments': () => json({ items: [] }),
    });
    show();
    expect(await screen.findByText('Sin adjuntos')).toBeVisible();
    await screen.findByRole('option', { name: 'camara.pdf' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Archivo' }), FILE_ID);
    await userEvent.type(screen.getByRole('textbox', { name: 'Qué es' }), 'Cámara de comercio');
    await userEvent.click(screen.getByRole('button', { name: 'Adjuntar' }));
    await waitFor(() => {
      expect(
        sent.find((request) => request.path === '/v1/attachments' && request.method === 'POST')
          ?.body,
      ).toEqual({
        ...RECORD,
        file_id: FILE_ID,
        label: 'Cámara de comercio',
      });
    });
  });
});

describe('adjuntos propios', () => {
  it('retira el adjunto propio', async () => {
    const sent = serve(['party.update'], {
      'GET /v1/attachments': () => json({ items: [attachment({ can_delete: true })] }),
      [`DELETE /v1/attachments/${ATTACHMENT_ID}`]: () => noContent(),
    });
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Retirar' }));
    await waitFor(() => {
      expect(sent.some((request) => request.path === `/v1/attachments/${ATTACHMENT_ID}`)).toBe(
        true,
      );
    });
  });
});
