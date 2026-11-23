import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { PrivacyHome } from '../../../../features/privacy/privacy-home';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Privacidad' };

export default function PrivacyPage(): JSX.Element {
  return (
    <RequirePermission
      anyOf={[
        'privacy.notice.manage',
        'privacy.consent.read',
        'privacy.activity.manage',
        'privacy.processor.manage',
        'privacy.request.manage',
        'privacy.incident.manage',
      ]}
    >
      <PageHeader
        title="Privacidad"
        description="Protección de datos personales (Ley 1581 de 2012): lo que el Oficial de Protección de Datos administra y la prueba de cada autorización."
      />
      <PrivacyHome />
    </RequirePermission>
  );
}
