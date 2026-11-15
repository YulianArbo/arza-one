import type { Metadata } from 'next';
import type { JSX } from 'react';

import { TicketForm } from '../../../../../../features/service/ticket-form';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Nuevo tiquete' };

export default function NewTicketPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['service.ticket.create']}>
      <TicketForm />
    </RequirePermission>
  );
}
