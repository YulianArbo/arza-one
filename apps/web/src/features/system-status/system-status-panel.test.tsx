import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiProvider } from '../../lib/api/api-provider';
import { SystemStatusPanel } from './system-status-panel';

const VERSION = { version: '0.1.0', environment: 'staging', commit: 'abc1234' };
const HEALTHY = { status: 'ok', checks: { database: 'up', queues: 'up', files: 'up' } };
const DEGRADED = { status: 'degraded', checks: { database: 'up', queues: 'down', files: 'up' } };

type Routes = Record<string, () => Response>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Simula la API: cada ruta responde lo indicado. */
function mockApi(routes: Routes): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: URL) => {
      const route = routes[url.pathname];
      return route ? Promise.resolve(route()) : Promise.reject(new TypeError('sin conexión'));
    }),
  );
}

function renderPanel(): void {
  render(
    <ApiProvider apiUrl="http://api.test">
      <SystemStatusPanel />
    </ApiProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pantalla de estado del sistema: datos', () => {
  it('muestra el esqueleto mientras carga y luego los datos de la API', async () => {
    mockApi({ '/version': () => json(VERSION), '/health': () => json(HEALTHY) });
    renderPanel();
    expect(screen.getByRole('status')).toHaveTextContent('Consultando el estado del sistema');
    expect(await screen.findByText('Todo funciona')).toBeVisible();
    expect(screen.getByText('Pruebas')).toBeVisible();
    expect(screen.getAllByText('Responde')).toHaveLength(3);
  });

  it('si una pieza no responde (503) lo dice con texto, no solo con color', async () => {
    mockApi({ '/version': () => json(VERSION), '/health': () => json(DEGRADED, 503) });
    renderPanel();
    expect(await screen.findByText('Hay piezas que no responden')).toBeVisible();
    expect(screen.getByText('No responde')).toBeVisible();
  });
});

describe('pantalla de estado del sistema: errores', () => {
  it('sin permiso muestra la explicación y ningún dato', async () => {
    const forbidden = {
      error: { code: 'FORBIDDEN', message: 'Sin permiso.', details: [], correlation_id: 'c-9' },
    };
    mockApi({ '/version': () => json(forbidden, 403), '/health': () => json(HEALTHY) });
    renderPanel();
    expect(await screen.findByText('No tiene acceso a esta sección')).toBeVisible();
    expect(screen.queryByText('0.1.0')).toBeNull();
  });

  it('con error del servidor muestra el código para soporte y permite reintentar', async () => {
    const failure = {
      error: { code: 'INTERNAL_ERROR', message: 'Falló.', details: [], correlation_id: 'c-500' },
    };
    let healthy = false;
    mockApi({
      '/version': () => (healthy ? json(VERSION) : json(failure, 500)),
      '/health': () => json(HEALTHY),
    });
    renderPanel();
    expect(await screen.findByText('c-500', {}, { timeout: 4000 })).toBeVisible();
    healthy = true;
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Todo funciona')).toBeVisible();
  });
});
