import { EmptyState } from '@arza/ui';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { PORTAL_SECTIONS, portalSection } from '../../../../features/portal/portal-sections';

export function generateStaticParams(): { seccion: string }[] {
  return PORTAL_SECTIONS.filter((section) => section.slug !== '').map((section) => ({
    seccion: section.slug,
  }));
}

/** Sección del portal que todavía no funciona (B30): lo dice, sin simular datos. */
export default async function PortalSectionPage({
  params,
}: {
  readonly params: Promise<{ seccion: string }>;
}): Promise<JSX.Element> {
  const section = portalSection((await params).seccion);
  if (section === undefined) notFound();
  return (
    <>
      <PageHeader title={section.label} description={section.description} />
      <EmptyState
        title="Disponible pronto"
        description="Esta sección del portal se está construyendo. Cuando esté lista, aquí verá su información."
      />
    </>
  );
}
