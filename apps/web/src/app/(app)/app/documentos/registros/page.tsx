import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RecordList } from '../../../../../features/forms/record-list';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Registros diligenciados' };

export default function RecordsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['doc.document.read']}>
      <RecordList />
    </RequirePermission>
  );
}
