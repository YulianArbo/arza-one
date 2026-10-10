import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { AuditSections } from '../../../../../features/audit/audit-sections';
import { SecurityEvents } from '../../../../../features/audit/security-events';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Eventos de seguridad' };

export default function SecurityEventsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['audit.security.read']}>
      <PageHeader
        title="Eventos de seguridad"
        description="Bloqueos de cuentas y alertas, como una alteración de la auditoría."
      />
      <AuditSections />
      <SecurityEvents />
    </RequirePermission>
  );
}
