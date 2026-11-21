import type { PermissionCode } from '@arza/contracts';
import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { ReactNode } from 'react';

import { Screen } from '../../test-support/core-fixtures';
import {
  SESSION,
  json,
  mockApi,
  renderWithApi,
  type SentRequest,
} from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { ANA, LUIS } from './sst-fixtures';

// Ayudas de las pruebas de pantallas de SST (B37): la API ficticia con la sesión y los permisos,
// la petición enviada a una ruta y abrir un diálogo por su botón.

export function serveSst(routes: object, codes: readonly PermissionCode[]): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    'GET /v1/sst/people': () => json({ data: [ANA, LUIS] }),
    'GET /v1/sst/employees': () => json({ data: [ANA, LUIS] }),
    ...routes,
  });
}

export function sentTo(sent: readonly SentRequest[], ending: string): SentRequest | undefined {
  return sent.find((request) => request.method !== 'GET' && request.path.endsWith(ending));
}

export function show(ui: ReactNode): void {
  renderWithApi(<Screen>{ui}</Screen>);
}

export async function openDialog(name: string): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog');
}
