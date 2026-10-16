import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { NotificationPreferencesPanel } from '../../../../../features/notifications/notification-preferences';

export const metadata: Metadata = { title: 'Preferencias de aviso' };

export default function NotificationPreferencesPage(): JSX.Element {
  return (
    <>
      <PageHeader
        title="Preferencias de aviso"
        description="Qué avisos quiere recibir también por correo."
      />
      <NotificationPreferencesPanel />
    </>
  );
}
