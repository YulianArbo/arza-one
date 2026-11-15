import type { Metadata } from 'next';
import type { JSX } from 'react';

import { CertificationsPanel } from '../../../../../features/finance/certifications-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Certificación de costos' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['finance.ledger.read']}>
      <CertificationsPanel />
    </RequirePermission>
  );
}
