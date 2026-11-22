import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityReviewDetail } from '../../../../../../features/quality/quality-review-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Acta de revisión' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['qms.read']}>
      <QualityReviewDetail id={id} />
    </RequirePermission>
  );
}
