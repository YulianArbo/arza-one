import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { AuditSections } from '../../../../../features/audit/audit-sections';
import { AuditExports } from '../../../../../features/audit/audit-exports';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Exportaciones de la auditoría' };

export default function AuditExportsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['audit.event.read']}>
      <PageHeader
        title="Exportaciones de la auditoría"
        description="Cada vez que alguien exportó la auditoría: quién, cuándo y con qué filtros."
      />
      <AuditSections />
      <AuditExports />
    </RequirePermission>
  );
}
