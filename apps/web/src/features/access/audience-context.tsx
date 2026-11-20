'use client';

import { createContext, use, useMemo, useState, type JSX, type ReactNode } from 'react';

import type { Audience } from './audience-switch';

// Pestaña elegida en el acceso (B36A): la comparten el formulario, que la cambia, y el panel de
// comunicados, que muestra los de esa pestaña. Fuera del inicio de sesión vale «empresa».

interface AudienceValue {
  readonly audience: Audience;
  readonly setAudience: (audience: Audience) => void;
}

const AudienceContext = createContext<AudienceValue | null>(null);

export function AudienceProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [audience, setAudience] = useState<Audience>('empresa');
  const value = useMemo(() => ({ audience, setAudience }), [audience]);
  return <AudienceContext value={value}>{children}</AudienceContext>;
}

/** La pestaña compartida del acceso; fuera de él (por ejemplo, en una prueba), una propia. */
export function useAudience(): AudienceValue {
  const shared = use(AudienceContext);
  const [audience, setAudience] = useState<Audience>('empresa');
  return shared ?? { audience, setAudience };
}
