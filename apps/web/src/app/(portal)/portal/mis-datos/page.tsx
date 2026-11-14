import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PortalMyDataPage } from '../../../../features/portal/portal-my-data';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Mis datos' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['portal.personal_data.manage']}>
      <PortalMyDataPage />
    </RequirePermission>
  );
}
