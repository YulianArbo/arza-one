import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PartyDetailPanel } from '../../../../../features/parties/party-detail';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Ficha del tercero' };

interface PartyPageProps {
  params: Promise<{ id: string }>;
}

export default async function PartyPage({ params }: PartyPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['party.read']}>
      <PartyDetailPanel id={id} />
    </RequirePermission>
  );
}
