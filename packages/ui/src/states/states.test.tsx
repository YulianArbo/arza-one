import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EmptyState } from './empty-state.js';
import { ErrorState } from './error-state.js';
import { ForbiddenState } from './forbidden-state.js';
import { LoadingState } from './loading-state.js';

describe('estados de pantalla (16.5)', () => {
  it('cargando: anuncia la carga al lector de pantalla y muestra el esqueleto', () => {
    const { container } = render(<LoadingState label="Cargando el estado" rows={2} />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando el estado…');
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
  });

  it('vacío: explica qué se verá y ofrece la acción de crear', () => {
    render(
      <EmptyState
        title="Aún no hay oportunidades"
        description="Aquí verá las oportunidades comerciales."
        action={<button type="button">Crear oportunidad</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Aún no hay oportunidades' })).toBeVisible();
    expect(screen.getByText('Aquí verá las oportunidades comerciales.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Crear oportunidad' })).toBeVisible();
  });
});

describe('estado de error (16.5)', () => {
  it('error: muestra el mensaje, el código para soporte y permite reintentar', async () => {
    const onRetry = vi.fn();
    render(
      <ErrorState message="El servidor no respondió." correlationId="abc-123" onRetry={onRetry} />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar la información');
    expect(alert).toHaveTextContent('El servidor no respondió.');
    expect(alert).toHaveTextContent('abc-123');
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('error: sin código ni reintento no muestra esos elementos', () => {
    render(<ErrorState title="Algo falló" message="Intente más tarde." />);
    expect(screen.getByRole('alert')).not.toHaveTextContent('soporte');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('estado sin permiso (16.5)', () => {
  it('sin permiso: explica a quién pedir acceso y no muestra datos', () => {
    render(<ForbiddenState whomToAsk="la Dirección" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No tiene acceso a esta sección');
    expect(alert).toHaveTextContent('solicítelo a la Dirección.');
  });

  it('sin permiso: por defecto remite al administrador de la plataforma', () => {
    render(<ForbiddenState />);
    expect(screen.getByRole('alert')).toHaveTextContent('el administrador de la plataforma');
  });
});
