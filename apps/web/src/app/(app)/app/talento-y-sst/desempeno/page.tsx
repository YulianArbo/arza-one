import type { Metadata } from 'next';
import type { JSX } from 'react';

import { DevelopmentAdmin } from '../../../../../features/hr/hr-admin-development';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Desempeño y formación' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['hr.performance.manage', 'hr.training.manage']}>
      <DevelopmentAdmin />
    </RequirePermission>
  );
}
