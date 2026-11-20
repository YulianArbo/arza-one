import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { AnnouncementsPanel } from '../../../../../features/announcements/announcements-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Comunicados' };

export default function AnnouncementsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['core.announcement.manage']}>
      <PageHeader
        title="Comunicados"
        description="Información para el personal y los clientes en la pantalla de acceso."
      />
      <AnnouncementsPanel />
    </RequirePermission>
  );
}
