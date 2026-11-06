import type { Metadata } from 'next';
import type { JSX } from 'react';

import { MyHours } from '../../../../../features/projects/my-hours';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Mis horas' };

export default function MyHoursPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['project.time.log']}>
      <MyHours />
    </RequirePermission>
  );
}
