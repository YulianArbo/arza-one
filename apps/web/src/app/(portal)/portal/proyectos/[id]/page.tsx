import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PortalProjectPage } from '../../../../../features/portal/portal-projects';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Proyecto' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: Props): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['portal.project.read']}>
      <PortalProjectPage id={id} />
    </RequirePermission>
  );
}
