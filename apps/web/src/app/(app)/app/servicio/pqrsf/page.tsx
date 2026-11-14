import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PqrsfInbox } from '../../../../../features/service/pqrsf-inbox';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'PQRSF' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['service.pqrsf.read']}>
      <PqrsfInbox />
    </RequirePermission>
  );
}
