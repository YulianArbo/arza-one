import type { Metadata } from 'next';
import type { JSX } from 'react';

import { CrmScreen } from '../../../../features/crm/crm-screen';
import { FunnelBoard } from '../../../../features/crm/funnel-board';

export const metadata: Metadata = { title: 'Comercial' };

export default function CommercialPage(): JSX.Element {
  return (
    <CrmScreen
      anyOf={['crm.opportunity.read']}
      title="Comercial"
      description="Embudo de oportunidades: arrastre una tarjeta o use «Mover a» para cambiarla de etapa."
    >
      <FunnelBoard />
    </CrmScreen>
  );
}
