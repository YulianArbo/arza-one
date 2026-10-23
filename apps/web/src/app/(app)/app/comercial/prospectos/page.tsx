import type { Metadata } from 'next';
import type { JSX } from 'react';

import { CrmScreen } from '../../../../../features/crm/crm-screen';
import { LeadList } from '../../../../../features/crm/lead-list';

export const metadata: Metadata = { title: 'Prospectos' };

export default function LeadsPage(): JSX.Element {
  return (
    <CrmScreen
      anyOf={['crm.lead.read']}
      title="Prospectos"
      description="Personas interesadas en los servicios: nuevo → calificado → convertido o descartado."
    >
      <LeadList />
    </CrmScreen>
  );
}
