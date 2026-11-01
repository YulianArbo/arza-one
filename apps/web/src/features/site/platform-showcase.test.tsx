import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { PlatformShowcase } from './platform-showcase';

describe('sección «ARZA ONE» de la vitrina (B22A)', () => {
  it('muestra un módulo a la vez y marca el elegido', async () => {
    render(<PlatformShowcase />);
    expect(screen.getByRole('heading', { name: 'Listado Maestro' })).toBeVisible();
    const audit = screen.getByRole('button', { name: 'Auditoría' });
    await userEvent.click(audit);
    expect(audit).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Documental' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('heading', { name: 'Trazabilidad verificable' })).toBeVisible();
  });
});
