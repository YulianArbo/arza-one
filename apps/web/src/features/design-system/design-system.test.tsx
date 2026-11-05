import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ChartSection } from './chart-sections';
import { ButtonSection, FeedbackSection, FormSection } from './component-sections';
import { StateSection } from './state-section';
import { ColorSection, TypographySection } from './token-sections';

describe('muestrario del sistema de diseño', () => {
  it('presenta colores, tipografías, componentes y estados', () => {
    render(
      <>
        <ColorSection />
        <TypographySection />
        <ButtonSection />
        <FeedbackSection />
        <FormSection />
        <StateSection />
      </>,
    );
    for (const title of [
      'Colores',
      'Tipografías',
      'Botones',
      'Estados y mensajes',
      'Campos de formulario',
      'Estados de pantalla',
    ]) {
      expect(screen.getByRole('region', { name: title })).toBeVisible();
    }
    expect(screen.getByRole('textbox', { name: 'Código' })).toHaveAccessibleDescription(
      'El código debe tener el formato PREFIJO-AAAA-NNNN.',
    );
  });

  it('la acción irreversible pide confirmación nombrando el registro', async () => {
    render(<ButtonSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Anular registro' }));
    expect(
      screen.getByRole('alertdialog', { name: '¿Anular el registro EJ-2026-0001?' }),
    ).toBeVisible();
  });

  it('el ejemplo de error ofrece reintentar', async () => {
    render(<StateSection />);
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(screen.getByText('0192f3a1-7c2e-7b11-9a55-2d1c6f0e4a10')).toBeVisible();
  });
});

describe('indicadores y gráficas del muestrario (B22A)', () => {
  it('presenta indicadores, gráficas con su tabla y el resumen de errores sin robar el foco', () => {
    render(<ChartSection />);
    expect(screen.getByRole('region', { name: 'Indicadores y gráficas' })).toBeVisible();
    expect(
      screen.getByRole('img', { name: 'Oportunidades por mes (ejemplo)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: 'Documentos por estado (ejemplo)' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).not.toHaveFocus();
  });
});
