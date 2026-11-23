import { screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ThemeProvider, useTheme } from '../../lib/theme/theme-provider';
import { apiError, json, mockApi, renderWithApi } from '../../test-support/fake-api';
import { forgetLinkToken } from '../access/link-token';
import { CookieConsentProvider, CookiePreferencesLink } from './cookie-consent';
import { LegalTextView } from './public-content';
import { ContactForm, QuoteForm } from './site-forms';
import { UnsubscribeView } from './unsubscribe-view';

// Sitio público del B41: aviso y centro de preferencias de cookies, formularios de contacto y
// cotización, textos legales publicados y baja de comunicaciones. Sin sesión. Datos ficticios.

const NOTICE = {
  id: '01900000-0000-7000-8000-000000000041',
  title: 'Autorización de contactos',
  body: 'Texto de prueba del aviso.',
  version_number: 3,
  purposes: ['COMMERCIAL'],
};

const POLICY = {
  id: '01900000-0000-7000-8000-000000000042',
  key: 'cookie_policy',
  title: 'Política de cookies',
  body: 'Texto de la política.\n\n## Cuáles usamos\n\n- Las necesarias.',
  version_number: 2,
  effective_from: '2026-11-22T15:00:00.000Z',
};

function clearCookies(): void {
  for (const entry of document.cookie.split('; ')) {
    const name = entry.split('=')[0];
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
}

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  clearCookies();
});

afterEach(() => {
  vi.unstubAllGlobals();
  forgetLinkToken();
  window.history.replaceState(null, '', '/');
  clearCookies();
});

function ThemeSwitch(): React.JSX.Element {
  const { setTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={() => {
        setTheme('dark');
      }}
    >
      Modo oscuro
    </button>
  );
}

function showSite(): void {
  renderWithApi(
    <ThemeProvider initialTheme="system">
      <CookieConsentProvider>
        <ThemeSwitch />
        <CookiePreferencesLink />
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

it('ofrece tres botones iguales y, al rechazar, solo quedan las necesarias', async () => {
  const sent = mockApi({
    'GET /v1/public/legal/cookie_policy': () => json(POLICY),
    'POST /v1/public/cookie-consent': () => json({ decided_at: POLICY.effective_from }, 201),
  });
  showSite();
  const banner = await screen.findByRole('region', { name: 'Usamos cookies' });
  const buttons = within(banner).getAllByRole('button');
  expect(buttons.map((button) => button.textContent)).toEqual([
    'Aceptar todas',
    'Rechazar las no necesarias',
    'Configurar',
  ]);
  expect(new Set(buttons.map((button) => button.className)).size).toBe(1);
  await userEvent.click(within(banner).getByRole('button', { name: 'Rechazar las no necesarias' }));
  expect(screen.queryByRole('region', { name: 'Usamos cookies' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Modo oscuro' }));
  expect(document.cookie).not.toContain('arza_theme');
  expect(document.cookie).toContain('arza_cookie_consent');
  expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
    policy_version: 2,
    choice: { preferences: false },
  });
});

it('el centro de preferencias viene desmarcado y recuerda el modo solo si se acepta', async () => {
  mockApi({
    'GET /v1/public/legal/cookie_policy': () => json(POLICY),
    'POST /v1/public/cookie-consent': () => json({ decided_at: POLICY.effective_from }, 201),
  });
  showSite();
  const banner = await screen.findByRole('region', { name: 'Usamos cookies' });
  await userEvent.click(within(banner).getByRole('button', { name: 'Configurar' }));
  const dialog = await screen.findByRole('dialog');
  const preferences = within(dialog).getByRole('checkbox', { name: 'Preferencias' });
  expect(preferences).not.toBeChecked();
  expect(within(dialog).getByRole('checkbox', { name: 'Analíticas' })).toBeDisabled();
  await userEvent.click(preferences);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar mis preferencias' }));
  await userEvent.click(screen.getByRole('button', { name: 'Modo oscuro' }));
  expect(document.cookie).toContain('arza_theme=dark');
  await userEvent.click(screen.getByRole('button', { name: 'Preferencias de cookies' }));
  expect(await screen.findByRole('dialog')).toBeVisible();
});

async function fillVisitor(): Promise<void> {
  await userEvent.type(await screen.findByLabelText('Nombres'), 'Ana');
  await userEvent.type(screen.getByLabelText('Apellidos'), 'Pérez');
  await userEvent.type(screen.getByLabelText('Correo'), 'ana@ejemplo.test');
}

it('el contacto exige la casilla, que viene sin marcar, y muestra la referencia', async () => {
  const sent = mockApi({
    'GET /v1/public/forms/notice': () => json({ available: true, notice: NOTICE }),
    'POST /v1/public/forms/contact': () =>
      json({ code: 'FRM-2026-0001', received_at: '2026-11-22T15:00:00.000Z' }, 201),
  });
  renderWithApi(<ContactForm />);
  const box = await screen.findByRole('checkbox');
  expect(box).not.toBeChecked();
  await fillVisitor();
  await userEvent.type(screen.getByLabelText('Su mensaje'), 'Quiero conocer sus servicios.');
  await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
  expect(screen.getAllByText(/debe autorizar el tratamiento/u).length).toBeGreaterThan(0);
  await userEvent.click(box);
  await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));
  expect(await screen.findByText('FRM-2026-0001')).toBeVisible();
  expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
    notice_id: NOTICE.id,
    accept_privacy: true,
    nickname: '',
    phone: null,
  });
});

it('la cotización envía el servicio y el plazo', async () => {
  const sent = mockApi({
    'GET /v1/public/forms/notice': () => json({ available: true, notice: NOTICE }),
    'POST /v1/public/forms/quote': () =>
      json({ code: 'FRM-2026-0002', received_at: '2026-11-22T15:00:00.000Z' }, 201),
  });
  renderWithApi(<QuoteForm />);
  await fillVisitor();
  await userEvent.selectOptions(await screen.findByLabelText('Servicio que le interesa'), 'cloud');
  await userEvent.type(
    screen.getByLabelText('Cuéntenos de su proyecto'),
    'Migrar dos servidores a la nube.',
  );
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: 'Solicitar cotización' }));
  expect(await screen.findByText('FRM-2026-0002')).toBeVisible();
  expect(sent.find((request) => request.method === 'POST')?.body).toMatchObject({
    service: 'cloud',
    timeframe: 'quarter',
  });
});

it('sin aviso publicado dice que el formulario no está disponible', async () => {
  mockApi({ 'GET /v1/public/forms/notice': () => json({ available: false, notice: null }) });
  renderWithApi(<ContactForm />);
  expect(await screen.findByText(/no está disponible/u)).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Enviar mensaje' })).toBeNull();
});

it('muestra el texto publicado con su versión, o que todavía no se publica', async () => {
  mockApi({
    'GET /v1/public/legal/cookie_policy': () => json(POLICY),
    'GET /v1/public/legal/site_terms': () =>
      apiError(404, 'SITE_RECORD_NOT_FOUND', 'Este texto todavía no se ha publicado.'),
  });
  const first = renderWithApi(<LegalTextView slug="cookies" title="Política de cookies" />);
  expect(await screen.findByRole('heading', { name: 'Cuáles usamos' })).toBeVisible();
  expect(screen.getByText(/Versión 2 · Vigente desde el 22\/11\/2026/u)).toBeVisible();
  first.unmount();
  renderWithApi(<LegalTextView slug="terminos" title="Términos y condiciones" />);
  expect(await screen.findByText(/todavía no se ha publicado/u)).toBeVisible();
});

it('la baja se registra al abrir el enlace, sin dejar la llave en la dirección', async () => {
  const token = 'C'.repeat(43);
  window.history.replaceState(null, '', `/baja#token=${token}`);
  const sent = mockApi({
    'POST /v1/public/unsubscribe': () => json({ email: 'a•••@ejemplo.test', already: false }),
  });
  renderWithApi(<UnsubscribeView />);
  expect(await screen.findByText(/no recibirá más comunicaciones/u)).toBeVisible();
  expect(window.location.hash).toBe('');
  expect(sent[0]?.body).toEqual({ token });
});
