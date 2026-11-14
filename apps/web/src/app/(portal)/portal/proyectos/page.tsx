import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PortalProjectsPage } from '../../../../features/portal/portal-projects';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Mis proyectos' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['portal.project.read']}>
      <PortalProjectsPage />
    </RequirePermission>
  );
}
