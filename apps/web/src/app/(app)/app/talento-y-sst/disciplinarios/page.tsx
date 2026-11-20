import type { Metadata } from 'next';
import type { JSX } from 'react';

import { DisciplineAdmin } from '../../../../../features/hr/hr-admin-discipline';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Procesos disciplinarios' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['hr.disciplinary.manage']}>
      <DisciplineAdmin />
    </RequirePermission>
  );
}
