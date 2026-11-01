import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PasswordStrength } from './password-strength';

describe('medidor de seguridad de la contraseña (B22A)', () => {
  it('sin texto sugiere una frase larga', () => {
    render(<PasswordStrength password="" />);
    expect(screen.getByText('Una frase larga que usted recuerde es lo más seguro.')).toBeVisible();
  });

  it('solo cuenta la longitud, como la regla de la API', () => {
    const { rerender } = render(<PasswordStrength password="corta" />);
    expect(screen.getByText('Seguridad: Muy corta')).toBeVisible();
    rerender(<PasswordStrength password={'a'.repeat(12)} />);
    expect(screen.getByText('Seguridad: Aceptable')).toBeVisible();
    rerender(<PasswordStrength password={'a'.repeat(16)} />);
    expect(screen.getByText('Seguridad: Buena')).toBeVisible();
    rerender(<PasswordStrength password="mi perro come arepas los lunes" />);
    expect(screen.getByText('Seguridad: Fuerte')).toBeVisible();
  });
});
