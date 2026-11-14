import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PortalApprovalsPage } from '../../../../features/portal/portal-signatures';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Por aprobar' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['portal.contract.read']}>
      <PortalApprovalsPage />
    </RequirePermission>
  );
}
