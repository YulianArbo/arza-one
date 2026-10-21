import type { Metadata } from 'next';
import type { JSX } from 'react';

import { DispositionList } from '../../../../../features/documents/dispositions';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Disposición final' };

export default function DispositionsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['doc.disposition.approve']}>
      <DispositionList />
    </RequirePermission>
  );
}
