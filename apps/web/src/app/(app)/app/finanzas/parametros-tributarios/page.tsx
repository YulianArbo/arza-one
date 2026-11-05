import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { TaxParametersPanel } from '../../../../../features/finance/tax-parameters-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Parámetros tributarios' };

export default function TaxParametersPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['finance.tax_parameter.manage']}>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Parámetros tributarios"
          description="Las tarifas de impuestos vigentes que usan las cotizaciones. Un cambio nunca borra la tarifa anterior."
        />
        <TaxParametersPanel />
      </div>
    </RequirePermission>
  );
}
