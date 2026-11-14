import type { Metadata } from 'next';
import type { JSX } from 'react';

import { TicketDetailPanel } from '../../../../../../features/service/ticket-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Ficha del tiquete' };

interface TicketPageProps {
  params: Promise<{ id: string }>;
}

export default async function TicketPage({ params }: TicketPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['service.ticket.read']}>
      <TicketDetailPanel id={id} />
    </RequirePermission>
  );
}
