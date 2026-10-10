import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { AuditSections } from '../../../../features/audit/audit-sections';
import { AuditEvents } from '../../../../features/audit/audit-events';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Auditoría' };

export default function AuditPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['audit.event.read']}>
      <PageHeader
        title="Auditoría"
        description="Quién hizo qué y cuándo en ARZA ONE. Consultar la auditoría también queda registrado."
      />
      <AuditSections />
      <AuditEvents />
    </RequirePermission>
  );
}
