import type { Metadata } from 'next';
import Link from 'next/link';
import type { JSX } from 'react';

import { PublicPrivacyRequestForm } from '../../../features/care-site/public-privacy-request';

// Derechos del titular (B42, decisión 1; Ley 1581 de 2012, arts. 8, 14 y 15; numeral 16.2):
// conocer, actualizar, corregir o suprimir sus datos y revocar su autorización, sin sesión.

export const metadata: Metadata = {
  title: 'Ejercer sus derechos sobre sus datos personales',
  description:
    'Pida conocer, corregir o suprimir sus datos personales, o revoque su autorización. Reciba un código y la fecha límite de respuesta.',
};

export default function DataSubjectRightsPage(): JSX.Element {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Sus derechos sobre sus datos</h1>
        <p className="text-muted-foreground">
          Usted puede conocer los datos personales que tenemos de usted, pedir que los corrijamos o
          los suprimamos y revocar su autorización. Las consultas se responden en máximo 10 días
          hábiles y los reclamos en máximo 15 (Ley 1581 de 2012).
        </p>
        <Link
          href="/derechos-del-titular/consulta"
          className="text-primary underline-offset-4 hover:underline"
        >
          ¿Ya envió una solicitud? Consulte el estado
        </Link>
      </header>
      <PublicPrivacyRequestForm />
    </section>
  );
}
