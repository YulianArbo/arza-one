import type { Metadata } from 'next';
import type { JSX } from 'react';

import { UnsubscribeView } from '../../../features/site/unsubscribe-view';

// Baja de comunicaciones comerciales en un clic (B41, ficha 17.18; decisión 9). La llave llega en
// el enlace del correo después de «#»: nunca viaja al servidor en la dirección.

export const metadata: Metadata = {
  title: 'Darse de baja',
  robots: { index: false, follow: false },
};

export default function UnsubscribePage(): JSX.Element {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Comunicaciones comerciales</h1>
      <UnsubscribeView />
    </section>
  );
}
