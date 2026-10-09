import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { AccessReviewPanel } from '../../../../../features/administration/access-review';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Revisión de accesos' };

export default function AccessReviewPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['iam.access_review.read']}>
      <PageHeader
        title="Revisión de accesos"
        description="Informe trimestral para la Dirección. Cada consulta queda registrada en la auditoría."
      />
      <AccessReviewPanel />
    </RequirePermission>
  );
}
