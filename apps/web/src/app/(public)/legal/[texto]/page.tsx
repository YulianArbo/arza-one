import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';

import { LEGAL_TEXTS } from '../../../../features/site/site-content';
import { SoonBadge } from '../../../../features/site/site-sections';

// Textos legales del sitio (capítulo 20). Su contenido versionado y aprobado llega con B41; hasta
// entonces la página lo dice y no muestra un texto provisional que pueda tomarse por vigente.

export const dynamicParams = false;

export function generateStaticParams(): { texto: string }[] {
  return LEGAL_TEXTS.map((text) => ({ texto: text.slug }));
}

interface Props {
  readonly params: Promise<{ texto: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = (await params).texto;
  return { title: LEGAL_TEXTS.find((text) => text.slug === slug)?.title ?? 'Texto legal' };
}

export default async function LegalTextPage({ params }: Props): Promise<JSX.Element> {
  const slug = (await params).texto;
  const text = LEGAL_TEXTS.find((item) => item.slug === slug);
  if (text === undefined) notFound();
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{text.title}</h1>
      <SoonBadge />
      <p className="text-muted-foreground">
        Estamos preparando este texto. Mientras se publica, puede escribirnos por los medios de
        contacto para cualquier consulta sobre sus datos personales.
      </p>
    </section>
  );
}
