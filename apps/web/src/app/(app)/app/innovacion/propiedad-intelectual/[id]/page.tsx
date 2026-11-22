import type { Metadata } from 'next';
import type { JSX } from 'react';

import { InnovationAssetDetail } from '../../../../../../features/innovation/innovation-asset-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Activo de propiedad intelectual' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['inn.read']}>
      <InnovationAssetDetail id={id} />
    </RequirePermission>
  );
}
