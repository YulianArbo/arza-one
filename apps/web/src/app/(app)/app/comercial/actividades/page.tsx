import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ActivityAgenda } from '../../../../../features/crm/activity-agenda';
import { CrmScreen } from '../../../../../features/crm/crm-screen';

export const metadata: Metadata = { title: 'Actividades comerciales' };

export default function ActivitiesPage(): JSX.Element {
  return (
    <CrmScreen
      anyOf={['crm.lead.read']}
      title="Actividades"
      description="Su agenda comercial: llamadas, reuniones y tareas, con recordatorio 30 minutos antes."
    >
      <ActivityAgenda />
    </CrmScreen>
  );
}
