import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../../components/app-shell/page-header';
import { OpportunityForm } from '../../../../../../features/crm/opportunity-form';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Registrar oportunidad' };

export default function NewOpportunityPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['crm.opportunity.create']}>
      <PageHeader
        title="Registrar oportunidad"
        description="Para un cliente que ya está en Terceros. Nace en Prospección."
      />
      <OpportunityForm />
    </RequirePermission>
  );
}
