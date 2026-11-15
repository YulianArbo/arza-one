import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PortalArticlePage } from '../../../../../../features/portal/portal-ticket';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Artículo de ayuda' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: Props): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['portal.ticket.read']}>
      <PortalArticlePage id={id} />
    </RequirePermission>
  );
}
