import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { NoticesPanel } from '../../../../../features/privacy/notices-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Avisos y versiones' };

export default function PrivacyNoticesPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['privacy.notice.manage']}>
      <PageHeader
        title="Avisos y versiones"
        description="Cada texto tiene versiones: se redacta en borrador y al publicarlo reemplaza al vigente. Lo publicado no se cambia, porque cada autorización guarda la versión que aceptó la persona."
      />
      <NoticesPanel />
    </RequirePermission>
  );
}
