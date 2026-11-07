import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ServiceHome } from '../../../../features/service/service-home';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Servicio al cliente' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['service.ticket.read', 'service.pqrsf.read', 'service.kb.read']}>
      <ServiceHome />
    </RequirePermission>
  );
}
