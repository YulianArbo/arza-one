import type { Metadata } from 'next';
import type { JSX } from 'react';

import { OpportunityDetailPanel } from '../../../../../../features/crm/opportunity-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Ficha de la oportunidad' };

interface OpportunityPageProps {
  params: Promise<{ id: string }>;
}

export default async function OpportunityPage({
  params,
}: OpportunityPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['crm.opportunity.read']}>
      <OpportunityDetailPanel id={id} />
    </RequirePermission>
  );
}
