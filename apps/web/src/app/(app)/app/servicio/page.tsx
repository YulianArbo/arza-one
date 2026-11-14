import type { Metadata } from 'next';
import type { JSX } from 'react';

import { TicketInbox } from '../../../../features/service/ticket-inbox';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Mesa de ayuda' };

export default function ServicePage(): JSX.Element {
  return (
    <RequirePermission anyOf={['service.ticket.read']}>
      <TicketInbox />
    </RequirePermission>
  );
}
