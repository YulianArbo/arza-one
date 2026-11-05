import type { Metadata } from 'next';
import type { JSX } from 'react';

import { CrmScreen } from '../../../../../features/crm/crm-screen';
import { ServicesPanel } from '../../../../../features/crm/services-panel';

export const metadata: Metadata = { title: 'Portafolio de servicios' };

export default function ServicesPage(): JSX.Element {
  return (
    <CrmScreen
      anyOf={['crm.quote.read']}
      title="Portafolio de servicios"
      description="Los servicios que ofrece la empresa, con su tarifa vigente y su impuesto."
    >
      <ServicesPanel />
    </CrmScreen>
  );
}
