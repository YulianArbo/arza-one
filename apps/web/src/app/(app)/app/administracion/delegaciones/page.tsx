import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { DelegationsPanel } from '../../../../../features/administration/delegations-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Delegaciones' };

export default function DelegationsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['iam.delegation.manage']}>
      <PageHeader
        title="Delegaciones"
        description="Delegue sus aprobaciones por un tiempo, por ejemplo durante unas vacaciones."
      />
      <DelegationsPanel />
    </RequirePermission>
  );
}
