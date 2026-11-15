import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PublicPqrsfStatusLookup } from '../../../../features/care-site/public-pqrsf-status';

// Consultar el estado de una PQRSF con el radicado y el correo (B29, decisión 4).

export const metadata: Metadata = {
  title: 'Consultar una PQRSF',
  description: 'Consulte el estado de su PQRSF con el número de radicado y su correo.',
};

export default function PqrsfStatusPage(): JSX.Element {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Consultar una PQRSF</h1>
        <p className="text-muted-foreground">
          Escriba el radicado que le dimos y el correo con que radicó. Si ya la respondimos, verá la
          respuesta.
        </p>
      </header>
      <PublicPqrsfStatusLookup />
    </section>
  );
}
