import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RecordDetail } from '../../../../../../features/forms/record-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Registro diligenciado' };

interface RecordPageProps {
  params: Promise<{ id: string }>;
}

export default async function RecordPage({ params }: RecordPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['doc.document.read']}>
      <RecordDetail id={id} />
    </RequirePermission>
  );
}
