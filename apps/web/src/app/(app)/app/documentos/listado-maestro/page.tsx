import type { Metadata } from 'next';
import type { JSX } from 'react';

import { MasterList } from '../../../../../features/documents/master-list';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Listado Maestro' };

export default function MasterListPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['doc.document.read']}>
      <MasterList />
    </RequirePermission>
  );
}
