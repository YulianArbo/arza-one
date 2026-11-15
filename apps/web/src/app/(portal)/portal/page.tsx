import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PortalHomePage } from '../../../features/portal/portal-home';
import { RequirePermission } from '../../../features/session/permissions';

export const metadata: Metadata = { title: 'Inicio' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['portal.project.read']}>
      <PortalHomePage />
    </RequirePermission>
  );
}
