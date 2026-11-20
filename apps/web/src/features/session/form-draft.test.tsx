import { ToastProvider } from '@arza/ui';
import { render, screen } from '@testing-library/react';
import { useState, type JSX } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveFormDraft } from './form-draft';
import { FormDraftRestore } from './form-draft-restore';

const PATH = '/app/compras/solicitudes';
vi.mock('next/navigation', () => ({ usePathname: () => PATH }));
vi.mock('./session-provider', () => ({
  useSession: () => ({ session: { user: { id: 'usuario-1' } } }),
}));

afterEach(() => {
  window.sessionStorage.clear();
});

function stored(): unknown {
  return JSON.parse(window.sessionStorage.getItem('arza.form-draft') ?? 'null');
}

function keep(userId: string, fields: readonly { id: string; value: string }[]): void {
  window.sessionStorage.setItem('arza.form-draft', JSON.stringify({ userId, path: PATH, fields }));
}

/** Formulario controlado, como los de la aplicación: el estado de todos los campos va junto. */
function RequestForm(): JSX.Element {
  const [values, setValues] = useState({ title: '', detail: '' });
  return (
    <form>
      <label htmlFor="solicitud-titulo">Título</label>
      <input
        id="solicitud-titulo"
        value={values.title}
        onChange={(event) => {
          setValues({ ...values, title: event.target.value });
        }}
      />
      <label htmlFor="solicitud-detalle">Detalle</label>
      <textarea
        id="solicitud-detalle"
        value={values.detail}
        onChange={(event) => {
          setValues({ ...values, detail: event.target.value });
        }}
      />
    </form>
  );
}

describe('borrador al vencer la sesión (B22B F4d)', () => {
  it('guarda lo escrito, pero nunca contraseñas, códigos ni datos bancarios', () => {
    render(
      <form>
        <input id="titulo" defaultValue="Portátiles" />
        <label htmlFor="cuenta">Número de cuenta bancaria</label>
        <input id="cuenta" defaultValue="123456" />
        <input id="clave" type="password" defaultValue="secreta" />
        <input id="codigo-confirmar" defaultValue="FAC-1" />
      </form>,
    );
    saveFormDraft('usuario-1', PATH);
    expect(stored()).toEqual({
      userId: 'usuario-1',
      path: PATH,
      fields: [{ id: 'titulo', value: 'Portátiles' }],
    });
  });

  it('no guarda nada si solo hay listas con su valor inicial o campos fuera de un formulario', () => {
    render(
      <>
        <input id="buscar" defaultValue="algo" />
        <form>
          <select id="estado" defaultValue="abierta">
            <option value="abierta">Abierta</option>
          </select>
        </form>
      </>,
    );
    saveFormDraft('usuario-1', PATH);
    expect(stored()).toBeNull();
  });
});

describe('recuperación del borrador (B22B F4d)', () => {
  it('devuelve lo escrito al abrir de nuevo el formulario y luego lo olvida', async () => {
    keep('usuario-1', [
      { id: 'solicitud-titulo', value: 'Portátiles' },
      { id: 'solicitud-detalle', value: 'Para el equipo nuevo' },
    ]);
    const { rerender } = render(
      <ToastProvider>
        <FormDraftRestore />
      </ToastProvider>,
    );
    expect(await screen.findByText(/Guardamos lo que estaba escribiendo/u)).toBeVisible();
    rerender(
      <ToastProvider>
        <FormDraftRestore />
        <RequestForm />
      </ToastProvider>,
    );
    await vi.waitFor(() => {
      expect(screen.getByLabelText('Detalle')).toHaveValue('Para el equipo nuevo');
    });
    expect(screen.getByLabelText('Título')).toHaveValue('Portátiles');
    expect(stored()).toBeNull();
  });

  it('descarta el borrador de otra persona', () => {
    keep('otra', [{ id: 'x', value: 'y' }]);
    render(
      <ToastProvider>
        <FormDraftRestore />
      </ToastProvider>,
    );
    expect(stored()).toBeNull();
  });
});
