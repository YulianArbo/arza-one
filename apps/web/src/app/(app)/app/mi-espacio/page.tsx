import type { Metadata } from 'next';
import type { JSX } from 'react';

import { MySpace } from '../../../../features/hr/my-space';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Mi espacio' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['hr.employee.read']}>
      <MySpace />
    </RequirePermission>
  );
}
