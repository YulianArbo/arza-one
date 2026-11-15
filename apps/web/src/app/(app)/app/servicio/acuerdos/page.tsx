import type { Metadata } from 'next';
import type { JSX } from 'react';

import { SlaPoliciesPage } from '../../../../../features/service/sla-policies-page';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Acuerdos de tiempo' };

export default function SlaPoliciesRoute(): JSX.Element {
  return (
    <RequirePermission anyOf={['service.ticket.read']}>
      <SlaPoliciesPage />
    </RequirePermission>
  );
}
