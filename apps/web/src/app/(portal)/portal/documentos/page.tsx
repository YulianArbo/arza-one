import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PortalDocumentsPage } from '../../../../features/portal/portal-documents';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Documentos' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['portal.project.read']}>
      <PortalDocumentsPage />
    </RequirePermission>
  );
}
