import type { Metadata } from 'next';
import type { JSX, ReactNode } from 'react';

import { AppShell } from '../../../components/app-shell/app-shell';

// Aplicación interna: nunca indexable (numeral 15.6).
export const metadata: Metadata = {
  title: { default: 'Inicio', template: '%s · ARZA ONE' },
  robots: { index: false, follow: false },
};

export default function InternalAppLayout({ children }: { children: ReactNode }): JSX.Element {
  return <AppShell>{children}</AppShell>;
}
