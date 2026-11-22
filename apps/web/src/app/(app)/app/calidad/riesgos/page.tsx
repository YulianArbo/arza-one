import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityRisks } from '../../../../../features/quality/quality-risks';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Riesgos y oportunidades' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['qms.read']}>
      <QualityRisks />
    </RequirePermission>
  );
}
