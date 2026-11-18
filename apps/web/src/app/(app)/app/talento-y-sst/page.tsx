import type { Metadata } from 'next';
import type { JSX } from 'react';

import { HrHome } from '../../../../features/hr/hr-home';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Talento Humano' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['hr.employee.read', 'hr.vacancy.manage', 'hr.candidate.manage']}>
      <HrHome />
    </RequirePermission>
  );
}
