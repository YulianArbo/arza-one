import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { SequencesPanel } from '../../../../../features/organization/sequences-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Consecutivos' };

export default function SequencesPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['core.sequence.manage']}>
      <PageHeader
        title="Consecutivos"
        description="Los códigos de los registros, como COT-2026-0001. Nunca se repiten ni saltan."
      />
      <SequencesPanel />
    </RequirePermission>
  );
}
