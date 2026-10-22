import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { JSX } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox, Radio } from './choice.js';
import { Pager, useCursorTrail } from './pager.js';
import { Select } from './select.js';
import { SimpleTable } from './simple-table.js';
import { TableCell, TableRow } from './table.js';
import { Textarea } from './textarea.js';

describe('controles de formulario', () => {
  it('el área de texto, la lista y las opciones responden al usuario', async () => {
    render(
      <>
        <Textarea aria-label="Observaciones" />
        <Select aria-label="Tipo" defaultValue="a">
          <option value="a">A</option>
          <option value="b">B</option>
        </Select>
        <Checkbox aria-label="Acepto" />
        <Radio aria-label="Sí" name="respuesta" />
      </>,
    );
    await userEvent.type(screen.getByLabelText('Observaciones'), 'Todo en orden');
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'b');
    await userEvent.click(screen.getByLabelText('Acepto'));
    await userEvent.click(screen.getByLabelText('Sí'));
    expect(screen.getByLabelText('Observaciones')).toHaveValue('Todo en orden');
    expect(screen.getByLabelText('Tipo')).toHaveValue('b');
    expect(screen.getByRole('checkbox', { name: 'Acepto' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Sí' })).toBeChecked();
  });
});

describe('tabla simple', () => {
  it('anuncia la columna de acciones sin texto visible', () => {
    render(
      <SimpleTable headers={['Nombre', '']} caption="Usuarios">
        <TableRow>
          <TableCell>Ana</TableCell>
          <TableCell>Editar</TableCell>
        </TableRow>
      </SimpleTable>,
    );
    expect(screen.getByRole('table', { name: 'Usuarios' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Acciones' })).toBeInTheDocument();
  });
});

function PagedList(): JSX.Element {
  const trail = useCursorTrail();
  return (
    <>
      <p>Página desde {trail.cursor ?? 'el inicio'}</p>
      <Pager page={{ next_cursor: 'c2' }} {...trail.pager} />
      <button type="button" onClick={trail.reset}>
        Volver al inicio
      </button>
    </>
  );
}

describe('paginación por cursor', () => {
  it('avanza, retrocede y vuelve a la primera página', async () => {
    render(<PagedList />);
    expect(screen.queryByRole('button', { name: 'Página anterior' })).toBeNull();
    expect(screen.getByText('Página 1')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Página desde c2')).toBeVisible();
    expect(screen.getByText('Página 2')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(screen.getByText('Página desde el inicio')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await userEvent.click(screen.getByRole('button', { name: 'Volver al inicio' }));
    expect(screen.getByText('Página desde el inicio')).toBeVisible();
  });

  it('sin página siguiente no ofrece avanzar', () => {
    render(
      <Pager page={{ next_cursor: null }} hasPrevious onPrevious={vi.fn()} onNext={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Página siguiente' })).toBeNull();
  });
});
