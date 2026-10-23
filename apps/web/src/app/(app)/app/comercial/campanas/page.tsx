import type { Metadata } from 'next';
import type { JSX } from 'react';

import { CampaignsPanel } from '../../../../../features/crm/campaigns-panel';
import { CrmScreen } from '../../../../../features/crm/crm-screen';

export const metadata: Metadata = { title: 'Campañas' };

export default function CampaignsPage(): JSX.Element {
  return (
    <CrmScreen
      anyOf={['crm.lead.read']}
      title="Campañas"
      description="De dónde llegan los prospectos: canal, fechas y presupuesto."
    >
      <CampaignsPanel />
    </CrmScreen>
  );
}
