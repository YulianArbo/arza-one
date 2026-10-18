import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ChangeRequestDetail } from '../../../../../../features/documents/change-request-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Solicitud de acción documental' };

interface RequestPageProps {
  params: Promise<{ id: string }>;
}

export default async function RequestPage({ params }: RequestPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['doc.document.read']}>
      <ChangeRequestDetail id={id} />
    </RequirePermission>
  );
}
