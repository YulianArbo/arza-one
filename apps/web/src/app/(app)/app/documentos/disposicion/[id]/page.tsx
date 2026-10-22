import type { Metadata } from 'next';
import type { JSX } from 'react';

import { DispositionDetail } from '../../../../../../features/documents/disposition-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Propuesta de disposición final' };

interface DispositionPageProps {
  params: Promise<{ id: string }>;
}

export default async function DispositionPage({
  params,
}: DispositionPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['doc.disposition.approve']}>
      <DispositionDetail id={id} />
    </RequirePermission>
  );
}
