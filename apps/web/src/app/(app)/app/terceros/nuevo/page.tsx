import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { PartyForm } from '../../../../../features/parties/party-form';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Registrar un tercero' };

export default function NewPartyPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['party.create']}>
      <PageHeader
        title="Registrar un tercero"
        description="Antes de guardar, la plataforma le avisa si el tercero ya parece estar registrado."
      />
      <div className="max-w-3xl">
        <PartyForm party={null} />
      </div>
    </RequirePermission>
  );
}
