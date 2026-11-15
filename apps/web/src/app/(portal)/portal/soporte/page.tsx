import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PortalSupportPage } from '../../../../features/portal/portal-support';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Soporte' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['portal.ticket.read']}>
      <PortalSupportPage />
    </RequirePermission>
  );
}
