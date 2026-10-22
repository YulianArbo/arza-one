import type { Metadata } from 'next';
import type { JSX } from 'react';

import { CrmScreen } from '../../../../../features/crm/crm-screen';
import { FunnelReportPanel } from '../../../../../features/crm/funnel-report';

export const metadata: Metadata = { title: 'Informe del embudo' };

export default function FunnelReportPage(): JSX.Element {
  return (
    <CrmScreen
      anyOf={['crm.report.read']}
      title="Informe del embudo"
      description="RE-COM-001 Registro de Oportunidades: etapas, totales y motivos de pérdida del periodo."
    >
      <FunnelReportPanel />
    </CrmScreen>
  );
}
