import type { Metadata } from 'next';
import type { JSX } from 'react';

import { MyTeam } from '../../../../../features/hr/my-team';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Mi equipo' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['hr.employee.read']}>
      <MyTeam />
    </RequirePermission>
  );
}
