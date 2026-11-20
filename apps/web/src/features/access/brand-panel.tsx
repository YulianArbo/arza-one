'use client';

import Link from 'next/link';
import { useMemo, type JSX } from 'react';

import { BrandLogo } from '../../components/brand-logo';
import { useHydrated } from '../../lib/hydration/use-hydrated';
import { randomMessage } from '../../lib/messages/daily-message';

/** Lema que se ve antes de cargar en el navegador, para no desentonar. */
const DEFAULT_MESSAGE = 'Su trabajo diario, en un solo lugar.';

/** Mensaje del día al azar del banco, uno por visita (B22B, decisión 2 del dueño). */
function Message(): JSX.Element {
  const hydrated = useHydrated();
  const text = useMemo(() => (hydrated ? randomMessage() : DEFAULT_MESSAGE), [hydrated]);
  return (
    <div className="flex max-w-lg flex-col gap-3">
      <span className="self-start rounded-full border border-brand-panel-muted/30 px-2.5 py-0.5 font-mono text-[11px] tracking-wide text-brand-panel-muted uppercase">
        Mensaje del día
      </span>
      <p
        key={text}
        className="text-3xl font-semibold tracking-tight text-brand-panel-foreground animate-enter"
      >
        {text}
      </p>
      <span className="text-sm text-brand-panel-muted">
        ARZA ONE, la plataforma de ARZA TECH S.A.S.
      </span>
    </div>
  );
}

/** Figura animada: la marca A1 con dos órbitas y un brillo suave. Solo decora. */
function Orbits(): JSX.Element {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute top-[44%] left-1/2 size-0">
      <div className="absolute -top-44 -left-44 size-88 rounded-full bg-brand-primary/25 blur-3xl" />
      <div className="absolute -top-60 -left-60 size-120 rounded-full border border-dashed border-brand-accent/25 animate-orbit">
        <span className="absolute -top-1 left-1/2 size-2 rounded-full bg-brand-accent" />
      </div>
      <div className="absolute -top-38 -left-38 size-76 rounded-full border border-brand-accent/15 animate-orbit-reverse">
        <span className="absolute top-1/2 -left-1 size-2 rounded-full bg-brand-primary" />
      </div>
      <div className="absolute -top-12 -left-12 flex size-24 items-center justify-center rounded-3xl bg-brand-panel-raised ring-1 ring-brand-panel-muted/20">
        <BrandLogo markOnly className="h-11 w-auto text-brand-panel-foreground" />
      </div>
    </div>
  );
}

/**
 * Panel de marca del acceso (B22A): siempre oscuro, con la marca animada y el mensaje del día.
 * Solo en escritorio; en celular la barra superior lleva el logo.
 */
export function BrandPanel(): JSX.Element {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-panel p-10 lg:flex">
      <Orbits />
      <Link href="/" className="relative self-start text-brand-panel-foreground">
        <BrandLogo onDark className="h-7 w-auto" />
      </Link>
      <div className="relative">
        <Message />
      </div>
    </aside>
  );
}
