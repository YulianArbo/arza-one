import type { Metadata } from 'next';
import type { JSX } from 'react';

import { Normograma } from '../../../../../features/direction/direction-normograma';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Normograma' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['qms.read']}>
      <Normograma />
    </RequirePermission>
  );
}
