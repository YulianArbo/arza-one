import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ClauseLibrary } from '../../../../../features/contracts/clause-library';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Biblioteca de cláusulas' };

export default function ClausesPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['contract.read']}>
      <ClauseLibrary />
    </RequirePermission>
  );
}
