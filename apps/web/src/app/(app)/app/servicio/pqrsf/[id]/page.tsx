import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PqrsfDetailPanel } from '../../../../../../features/service/pqrsf-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Ficha de la PQRSF' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['service.pqrsf.read']}>
      <PqrsfDetailPanel id={id} />
    </RequirePermission>
  );
}
