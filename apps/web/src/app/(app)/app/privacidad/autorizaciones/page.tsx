import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { ConsentsPanel } from '../../../../../features/privacy/consents-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Autorizaciones' };

export default function PrivacyConsentsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['privacy.consent.read']}>
      <PageHeader
        title="Autorizaciones"
        description="Prueba de cada autorización de tratamiento: el texto y la versión aceptados, las finalidades, cómo y cuándo se obtuvo, y quién la registró."
      />
      <ConsentsPanel />
    </RequirePermission>
  );
}
