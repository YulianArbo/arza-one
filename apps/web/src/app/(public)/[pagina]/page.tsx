import type { JSX } from 'react';

import { PublicPageView } from '../../../features/site/public-content';

// Páginas institucionales administrables (B41, ficha 17.18), como «Nosotros». Las direcciones de la
// plataforma tienen su propia ruta y no se pueden usar para una página (RESERVED_PAGE_SLUGS).

interface Props {
  readonly params: Promise<{ pagina: string }>;
}

export default async function InstitutionalPage({ params }: Props): Promise<JSX.Element> {
  const slug = (await params).pagina;
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-16">
      <PublicPageView slug={slug} />
    </section>
  );
}
