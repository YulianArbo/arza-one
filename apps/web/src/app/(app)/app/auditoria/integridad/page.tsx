import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { AuditSections } from '../../../../../features/audit/audit-sections';
import { ChainVerificationPanel } from '../../../../../features/audit/chain-verification';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Verificación de integridad' };

export default function IntegrityPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['audit.chain.verify']}>
      <PageHeader
        title="Verificación de integridad"
        description="Compruebe que ningún evento de la auditoría falte, sobre ni haya sido modificado."
      />
      <AuditSections />
      <ChainVerificationPanel />
    </RequirePermission>
  );
}
