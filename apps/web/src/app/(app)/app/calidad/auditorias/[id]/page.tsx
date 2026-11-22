import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityAuditDetail } from '../../../../../../features/quality/quality-audit-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Auditoría' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['qms.read', 'qms.audit.execute']}>
      <QualityAuditDetail id={id} />
    </RequirePermission>
  );
}
