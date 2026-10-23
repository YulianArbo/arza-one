import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../../components/app-shell/page-header';
import { LeadForm } from '../../../../../../features/crm/lead-form';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Registrar prospecto' };

export default function NewLeadPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['crm.lead.create']}>
      <PageHeader
        title="Registrar prospecto"
        description="Al guardar, el equipo comercial recibe en Mis tareas la tarea «Contactar al prospecto»."
      />
      <LeadForm />
    </RequirePermission>
  );
}
