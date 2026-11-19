import type { Metadata } from 'next';
import type { JSX } from 'react';

import { OffboardingAdmin } from '../../../../../features/hr/hr-admin-offboarding';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Retiros' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['hr.offboarding.manage']}>
      <OffboardingAdmin />
    </RequirePermission>
  );
}
