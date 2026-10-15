import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { PartyList } from '../../../../features/parties/party-list';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Terceros' };

export default function PartiesPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['party.read']}>
      <PageHeader
        title="Terceros"
        description="Clientes, proveedores, colaboradores, contactos y candidatos: un solo registro de cada uno."
      />
      <PartyList />
    </RequirePermission>
  );
}
