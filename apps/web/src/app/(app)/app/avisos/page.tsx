import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { NotificationCenter } from '../../../../features/notifications/notification-center';

export const metadata: Metadata = { title: 'Avisos' };

export default function NotificationsPage(): JSX.Element {
  return (
    <>
      <PageHeader
        title="Avisos"
        description="Sus avisos, del más reciente al más antiguo. Fuera de la jornada laboral, los avisos que no son urgentes esperan al inicio de la siguiente."
      />
      <NotificationCenter />
    </>
  );
}
