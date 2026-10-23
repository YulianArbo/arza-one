import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { FormField } from './form-field.js';
import { SelectField } from './select-field.js';
import { TextareaField } from './textarea-field.js';

const OPTIONS = [
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
];

describe('campo de texto con etiqueta (16.6)', () => {
  it('asocia la etiqueta, la ayuda y el error al campo', () => {
    render(
      <FormField id="correo" label="Correo" hint="El de la empresa" error="Falta el correo" />,
    );
    const input = screen.getByLabelText('Correo');
    expect(input).toHaveAccessibleDescription('El de la empresa Falta el correo');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('sin ayuda ni error no describe ni marca el campo', () => {
    render(<FormField id="nombre" label="Nombre" error={null} />);
    const input = screen.getByLabelText('Nombre');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});

describe('texto largo con etiqueta (16.6)', () => {
  it('asocia la etiqueta, la ayuda y el error al campo', () => {
    render(<TextareaField id="nota" label="Nota" hint="Opcional" error="Muy corta" />);
    const textarea = screen.getByLabelText('Nota');
    expect(textarea).toHaveAccessibleDescription('Opcional Muy corta');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
  });

  it('sin ayuda ni error no describe ni marca el campo', () => {
    render(<TextareaField id="necesidad" label="Necesidad" />);
    const textarea = screen.getByLabelText('Necesidad');
    expect(textarea).not.toHaveAttribute('aria-describedby');
    expect(textarea).not.toHaveAttribute('aria-invalid');
  });
});

describe('lista desplegable con etiqueta (16.6)', () => {
  it('muestra las opciones y deja elegir una', async () => {
    render(<SelectField id="estado" label="Estado" options={OPTIONS} defaultValue="activo" />);
    const select = screen.getByLabelText('Estado');
    await userEvent.selectOptions(select, 'inactivo');
    expect(select).toHaveValue('inactivo');
    expect(select).not.toHaveAttribute('aria-describedby');
  });

  it('anuncia la ayuda y el error', () => {
    render(
      <SelectField
        id="sede"
        label="Sede"
        options={OPTIONS}
        hint="Donde trabaja"
        error="Elija una"
      />,
    );
    const select = screen.getByLabelText('Sede');
    expect(select).toHaveAccessibleDescription('Donde trabaja Elija una');
    expect(select).toHaveAttribute('aria-invalid', 'true');
  });
});
