import type { Metadata } from 'next';
import type { JSX } from 'react';

import { AbsencesAdmin } from '../../../../../features/hr/hr-admin-absences';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Permisos, vacaciones y horas extras' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['hr.leave.approve', 'hr.overtime.authorize']}>
      <AbsencesAdmin />
    </RequirePermission>
  );
}
