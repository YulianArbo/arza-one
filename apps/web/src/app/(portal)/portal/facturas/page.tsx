import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PortalInvoicesPage } from '../../../../features/portal/portal-invoices';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Facturas' };

/** Consulta de las facturas fiscales emitidas de la empresa del cliente autenticado (B31). */
export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['portal.invoice.read']}>
      <PortalInvoicesPage />
    </RequirePermission>
  );
}
