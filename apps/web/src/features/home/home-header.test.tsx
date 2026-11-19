import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { personalMessage } from '../../lib/messages/daily-message';
import { serveCrm } from '../../test-support/crm-fixtures';
import { renderWithApi } from '../../test-support/fake-api';
import { permissions } from '../../test-support/ntf-fixtures';
import { bogotaToday } from '../crm/labels';
import { HomeHeader } from './home-header';

vi.mock('../session/session-provider', () => ({
  useSession: () => ({ session: { user: { id: 'usuario-1', display_name: 'Ana Pérez' } } }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('encabezado de «Su jornada» (B22B)', () => {
  it('saluda por el nombre y muestra el mensaje personal del día', async () => {
    serveCrm(permissions(['wf.task.work']), {});
    renderWithApi(<HomeHeader />);
    expect(screen.getByRole('heading', { level: 1, name: 'Su jornada' })).toBeVisible();
    expect(await screen.findByText(/^Buen(os|as) (días|tardes|noches), Ana · /u)).toBeVisible();
    const message = personalMessage('usuario-1', bogotaToday(new Date()));
    expect(screen.getByText(message)).toBeVisible();
    expect(await screen.findByRole('link', { name: 'Ver mis tareas' })).toHaveAttribute(
      'href',
      '/app/mis-tareas',
    );
  });

  it('sin permiso para atender tareas no ofrece «Ver mis tareas»', async () => {
    serveCrm(permissions([]), {});
    renderWithApi(<HomeHeader />);
    expect(await screen.findByText(/, Ana · /u)).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Ver mis tareas' })).toBeNull();
  });
});
