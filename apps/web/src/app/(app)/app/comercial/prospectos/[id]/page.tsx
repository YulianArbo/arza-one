import type { Metadata } from 'next';
import type { JSX } from 'react';

import { LeadDetailPanel } from '../../../../../../features/crm/lead-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Ficha del prospecto' };

interface LeadPageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadPage({ params }: LeadPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['crm.lead.read']}>
      <LeadDetailPanel id={id} />
    </RequirePermission>
  );
}
