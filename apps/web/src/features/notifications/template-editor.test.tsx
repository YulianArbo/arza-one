import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SESSION, apiError, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { permissions, template } from '../../test-support/ntf-fixtures';
import { RequireSession } from '../session/session-provider';
import { TemplateEditor } from './template-editor';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/app/administracion/plantillas',
}));

function Screen({ children }: { readonly children: ReactNode }): JSX.Element {
  return <RequireSession kind="internal">{children}</RequireSession>;
}

function serve(patch: () => Response) {
  let current = template();
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissions(['ntf.template.manage'])),
    'GET /v1/notification-templates': () => json({ items: [current] }),
    'PATCH /v1/notification-templates/task_assigned': () => {
      const response = patch();
      if (response.ok) current = template({ subject: 'Tarea nueva: {{tarea}}', version: 3 });
      return response;
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function editSubject(): Promise<void> {
  const subject = await screen.findByRole('textbox', { name: 'Asunto' });
  await userEvent.clear(subject);
  await userEvent.type(subject, 'Tarea nueva: {{{{tarea}}');
  await userEvent.click(screen.getByRole('button', { name: 'Guardar versión nueva' }));
}

describe('plantillas de aviso', () => {
  it('muestra los datos permitidos y guarda una versión nueva con If-Match', async () => {
    const sent = serve(() => json(template({ version: 3 })));
    renderWithApi(
      <Screen>
        <TemplateEditor />
      </Screen>,
    );
    expect(
      await screen.findByText(/Puede usar: \{\{nombre\}\}, \{\{tarea\}\}, \{\{vence\}\}/),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Guardar versión nueva' })).toBeDisabled();
    await editSubject();
    expect(await screen.findByText('Plantilla guardada como versión nueva.')).toBeVisible();
    const patch = sent.find((request) => request.method === 'PATCH');
    expect(patch?.headers).toMatchObject({ 'If-Match': '"2"' });
    expect(patch?.body).toMatchObject({ subject: 'Tarea nueva: {{tarea}}', urgent: false });
    await waitFor(() => {
      expect(screen.getByText(/Versión 3/)).toBeVisible();
    });
  });

  it('muestra el error de la API, por ejemplo un dato que el aviso no tiene', async () => {
    serve(() =>
      apiError(
        422,
        'NTF_TEMPLATE_INVALID',
        'La plantilla usa datos que este aviso no tiene: {{monto}}.',
      ),
    );
    renderWithApi(
      <Screen>
        <TemplateEditor />
      </Screen>,
    );
    await editSubject();
    expect(await screen.findByText(/no tiene: \{\{monto\}\}/)).toBeVisible();
  });
});

describe('plantillas urgentes', () => {
  it('marca las urgentes', async () => {
    mockApi({
      'GET /v1/auth/session': () => json(SESSION),
      'GET /v1/me/permissions': () => json(permissions(['ntf.template.manage'])),
      'GET /v1/notification-templates': () =>
        json({
          items: [template({ kind: 'security_alert', label: 'Alerta de seguridad', urgent: true })],
        }),
    });
    renderWithApi(
      <Screen>
        <TemplateEditor />
      </Screen>,
    );
    expect(await screen.findByText('Urgente', { selector: 'span' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Urgente' })).toBeChecked();
  });
});
