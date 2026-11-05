import type { Metadata } from 'next';
import type { JSX } from 'react';

import { VerifyDocument } from '../../../features/verification/verify-document';

// Verificación pública de documentos firmados (B25, numeral 19.3; ficha 17.18 «Verificar documento»).

export const metadata: Metadata = {
  title: 'Verificar un documento',
  description: 'Compruebe que un documento firmado electrónicamente en ARZA ONE es el original.',
};

export default function VerifyPage(): JSX.Element {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Verificar un documento</h1>
        <p className="text-muted-foreground">
          Escriba el código de verificación que aparece en la página de firmas o cargue el PDF que
          recibió. Le diremos si coincide con el original firmado, sin mostrar su contenido. Si el
          archivo cambió, aunque sea en un solo carácter, no coincidirá.
        </p>
      </header>
      <VerifyDocument />
    </section>
  );
}
