import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityReviews } from '../../../../../features/quality/quality-reviews';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Revisión por la dirección' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['qms.read']}>
      <QualityReviews />
    </RequirePermission>
  );
}
