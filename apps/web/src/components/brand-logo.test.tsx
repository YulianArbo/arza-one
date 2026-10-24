import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandLogo } from './brand-logo';

describe('logotipo de ARZA ONE', () => {
  it('se anuncia como «ARZA ONE» y pinta «ONE» con el color primario', () => {
    const { container } = render(<BrandLogo />);
    expect(screen.getByRole('img', { name: 'ARZA ONE' })).toBeInTheDocument();
    expect(container.querySelector('svg > path:last-of-type')).toHaveAttribute(
      'fill',
      'var(--primary)',
    );
  });

  it('sobre las barras oscuras usa el acento claro de la marca', () => {
    const { container } = render(<BrandLogo onDark />);
    expect(container.querySelector('svg > path:last-of-type')).toHaveAttribute(
      'fill',
      'var(--brand-accent)',
    );
  });

  it('en espacios angostos muestra solo la figura «A1»', () => {
    const { container } = render(<BrandLogo markOnly />);
    expect(screen.getByRole('img', { name: 'ARZA ONE' })).toHaveAttribute(
      'viewBox',
      '100 88 312 336',
    );
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
});
