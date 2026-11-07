import type { Metadata } from 'next';
import Link from 'next/link';
import type { JSX } from 'react';

import { PublicPqrsfForm } from '../../../features/care-site/public-pqrsf-form';

// Radicar una PQRSF (B29, ficha 17.9; Ley 1480, art. 50; numeral 16.2 «PQRSF y consulta de
// radicado»). El sitio completo llega en el B41; esta página ya radica.

export const metadata: Metadata = {
  title: 'Peticiones, quejas, reclamos, sugerencias y felicitaciones',
  description: 'Radique su PQRSF y reciba su número de radicado y la fecha límite de respuesta.',
};

export default function PqrsfPage(): JSX.Element {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Radicar una PQRSF</h1>
        <p className="text-muted-foreground">
          Presente una petición, queja, reclamo, sugerencia o felicitación. Le damos un número de
          radicado y una fecha límite de respuesta, que también le enviamos por correo.
        </p>
        <Link href="/pqrsf/consulta" className="text-primary underline-offset-4 hover:underline">
          ¿Ya radicó? Consulte el estado
        </Link>
      </header>
      <PublicPqrsfForm />
    </section>
  );
}
