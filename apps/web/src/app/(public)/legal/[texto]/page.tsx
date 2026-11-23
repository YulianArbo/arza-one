import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';

import { LegalTextView } from '../../../../features/site/public-content';
import { LEGAL_TEXTS } from '../../../../features/site/site-content';

// Textos legales del sitio (numeral 20.2): la versión publicada y aprobada (B41). Si todavía no hay
// una publicada, la página lo dice y no muestra un texto provisional que pueda tomarse por vigente.

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
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-16">
      <LegalTextView slug={text.slug} title={text.title} />
    </section>
  );
}
