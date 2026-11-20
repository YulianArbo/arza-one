import type { Metadata } from 'next';
import type { JSX } from 'react';

import { CrmScreen } from '../../../../features/crm/crm-screen';
import { FunnelBoard } from '../../../../features/crm/funnel-board';
import { CommercialAlso, QuotesAction } from '../../../../features/crm/funnel-extras';

export const metadata: Metadata = { title: 'Comercial' };

/** Embudo de Comercial (B22B, boceto 06): columnas por etapa y las demás funciones del módulo. */
export default function CommercialPage(): JSX.Element {
  return (
    <CrmScreen
      anyOf={['crm.opportunity.read']}
      title="Comercial"
      description="Mueva una oportunidad entre etapas y vea cómo cambia el valor de cada columna."
      action={<QuotesAction />}
    >
      <FunnelBoard />
      <CommercialAlso />
    </CrmScreen>
  );
}
