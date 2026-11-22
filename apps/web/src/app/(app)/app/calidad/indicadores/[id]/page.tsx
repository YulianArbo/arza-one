import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityIndicatorDetail } from '../../../../../../features/quality/quality-indicator-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Indicador' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['qms.read', 'qms.indicator.measure']}>
      <QualityIndicatorDetail id={id} />
    </RequirePermission>
  );
}
