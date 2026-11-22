import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityAudits } from '../../../../../features/quality/quality-audits';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Programa y auditorías' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['qms.read']}>
      <QualityAudits />
    </RequirePermission>
  );
}
