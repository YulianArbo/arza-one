import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PublicPrivacyStatusLookup } from '../../../../features/care-site/public-privacy-status';

// Consultar el estado de una solicitud de titular con el código y el correo (B42).

export const metadata: Metadata = {
  title: 'Consultar una solicitud sobre sus datos',
  description: 'Consulte el estado de su solicitud con el código y su correo.',
};

export default function DataSubjectStatusPage(): JSX.Element {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Consultar una solicitud</h1>
        <p className="text-muted-foreground">
          Escriba el código que le dimos y el correo con que presentó la solicitud. Si ya la
          respondimos, verá la respuesta.
        </p>
      </header>
      <PublicPrivacyStatusLookup />
    </section>
  );
}
