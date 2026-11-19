import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PayrollAdmin } from '../../../../../features/hr/hr-admin-payroll';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Novedades de nómina' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['hr.payroll_novelty.close']}>
      <PayrollAdmin />
    </RequirePermission>
  );
}
