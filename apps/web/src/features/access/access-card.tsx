import type { JSX, ReactNode } from 'react';

interface AccessCardProps {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}

/** Encabezado y formulario de las pantallas de acceso, sin marco: el fondo es la página (B22A). */
export function AccessCard({ title, description, children }: AccessCardProps): JSX.Element {
  return (
    <section
      aria-labelledby="acceso-titulo"
      className="flex w-full max-w-sm flex-col gap-6 animate-enter"
    >
      <header className="flex flex-col gap-1.5">
        <h1 id="acceso-titulo" className="text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      {children}
    </section>
  );
}
