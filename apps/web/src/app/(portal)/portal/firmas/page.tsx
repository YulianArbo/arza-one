import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PortalSignaturesPage } from '../../../../features/portal/portal-signatures';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Contratos y firmas' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['portal.contract.read']}>
      <PortalSignaturesPage />
    </RequirePermission>
  );
}
