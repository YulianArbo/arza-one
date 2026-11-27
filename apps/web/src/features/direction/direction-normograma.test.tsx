import type { PermissionCode } from '@arza/contracts';
import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { json, mockApi, SESSION, type SentRequest } from '../../test-support/fake-api';
import { permissionsOf } from '../../test-support/party-fixtures';
import { openDialog, sentTo, show } from '../sst/sst-test-support';
import { DIR_ID, EVALUATED, IMPORT_REVIEW, ME, REQUIREMENT } from './direction-fixtures';
import { Normograma } from './direction-normograma';

// Normograma y evaluación de cumplimiento (B46, decisiones 6 y 7).

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/direccion/normograma',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

const QUALITY: readonly PermissionCode[] = ['qms.read', 'qms.legal.manage', 'qms.legal.evaluate'];
const LIST = { data: [REQUIREMENT, EVALUATED], current_period: 'S2 2026' };

function serve(routes: object, codes: readonly PermissionCode[] = QUALITY): SentRequest[] {
  return mockApi({
    'GET /v1/auth/session': () => json(SESSION),
    'GET /v1/me/permissions': () => json(permissionsOf(codes)),
    'GET /v1/qms/legal-requirements': () => json(LIST),
    'GET /v1/qms/people': () => json({ data: [ME] }),
    'GET /v1/org-units': () => json({ data: [] }),
    ...routes,
  });
}

it('cada requisito muestra su última evaluación y si falta evaluarlo en el semestre', async () => {
  serve({}, ['qms.read']);
  show(<Normograma />);
  expect(await screen.findByText('Por evaluar en el semestre')).toBeVisible();
  expect(
    screen.getByText(/Semestre en curso: S2 2026\. Pendientes de evaluar: 1\./u),
  ).toBeVisible();
  expect(screen.getByText('No cumple')).toBeVisible();
  expect(screen.getByText(/20\/11\/2026 · acción AC-2026-0007/u)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Evaluar' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Registrar requisito' })).toBeNull();
});

it('«No cumple» envía la acción de mejora con su responsable y fecha', async () => {
  const sent = serve({
    [`POST /v1/qms/legal-requirements/${REQUIREMENT.id}/evaluations`]: () =>
      json({ id: DIR_ID(50) }, 201),
  });
  show(<Normograma />);
  const [first] = await screen.findAllByRole('button', { name: 'Evaluar' });
  if (first === undefined) throw new Error('Falta el botón');
  await userEvent.click(first);
  const dialog = await screen.findByRole('dialog');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.selectOptions(field('Resultado'), 'fails');
  await userEvent.type(field('Qué se revisó y dónde está la evidencia'), 'Falta el aviso.');
  await userEvent.type(field('Acción de mejora (si es parcial o no cumple)'), 'Publicar el aviso');
  await userEvent.selectOptions(field('Responsable de la acción'), ME.id);
  await userEvent.type(field('Fecha compromiso de la acción'), '2099-12-15');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar evaluación' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/evaluations')?.body).toMatchObject({
      result: 'fails',
      action: { description: 'Publicar el aviso', responsible_id: ME.id, due_on: '2099-12-15' },
    });
  });
});

it('registra un requisito sin proceso ni responsable', async () => {
  const sent = serve({
    'POST /v1/qms/legal-requirements': () => json({ id: DIR_ID(51), code: 'NRM-003' }, 201),
  });
  show(<Normograma />);
  const dialog = await openDialog('Registrar requisito');
  const field = (label: string) => within(dialog).getByLabelText(label);
  await userEvent.type(field('Norma'), 'Ley 2300 de 2023');
  await userEvent.type(field('Entidad que la expide'), 'Congreso');
  await userEvent.type(field('Qué exige a la empresa'), 'Contactar solo en horario permitido.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
  await vi.waitFor(() => {
    expect(sentTo(sent, '/v1/qms/legal-requirements')?.body).toMatchObject({
      norm: 'Ley 2300 de 2023',
      article: null,
      process_id: null,
      responsible_id: null,
      applies: true,
    });
  });
});

it('el archivo se revisa antes de guardarlo y el normograma se descarga', async () => {
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:n'), revokeObjectURL: vi.fn() }),
  );
  const sent = serve({
    'POST /v1/qms/legal-requirements/import': () => json(IMPORT_REVIEW),
    'POST /v1/qms/legal-requirements/export': () =>
      new Response('Código;Norma\r\n', {
        headers: { 'Content-Disposition': 'attachment; filename="normograma.csv"' },
      }),
  });
  show(<Normograma />);
  const dialog = await openDialog('Cargar archivo');
  expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeDisabled();
  const file = new File(['Tipo de norma;Norma\r\nLey;Ley 2300'], 'normograma.csv', {
    type: 'text/csv',
  });
  await userEvent.upload(within(dialog).getByLabelText('Archivo del normograma'), file);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Revisar' }));
  expect(
    await within(dialog).findByText('Revisión lista: 1 nuevos y 0 por actualizar.'),
  ).toBeVisible();
  expect(sentTo(sent, '/import')?.body).toMatchObject({ apply: false });
  expect(within(dialog).getByRole('button', { name: 'Guardar' })).toBeEnabled();
  await userEvent.keyboard('{Escape}');
  await userEvent.click(screen.getByRole('button', { name: 'Descargar normograma (CSV)' }));
  expect(await screen.findByText('Descargamos normograma.csv.')).toBeVisible();
});
