import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { ProcessorsPanel } from '../../../../../features/privacy/processors-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Encargados' };

export default function PrivacyProcessorsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['privacy.processor.manage']}>
      <PageHeader
        title="Encargados"
        description="Proveedores que tratan datos personales por cuenta de la empresa. Todo encargado debe tener contrato de transmisión."
      />
      <ProcessorsPanel />
    </RequirePermission>
  );
}
