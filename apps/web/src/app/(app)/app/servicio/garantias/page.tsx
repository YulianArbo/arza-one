import type { Metadata } from 'next';
import type { JSX } from 'react';

import { WarrantiesPage } from '../../../../../features/service/warranties-page';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Garantías' };

export default function WarrantiesRoute(): JSX.Element {
  return (
    <RequirePermission anyOf={['service.ticket.read']}>
      <WarrantiesPage />
    </RequirePermission>
  );
}
