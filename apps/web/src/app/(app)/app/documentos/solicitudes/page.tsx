import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ChangeRequestList } from '../../../../../features/documents/change-request-list';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Solicitudes de Acción Documental' };

export default function ChangeRequestsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['doc.document.read']}>
      <ChangeRequestList />
    </RequirePermission>
  );
}
