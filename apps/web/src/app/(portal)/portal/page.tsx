import { EmptyState } from '@arza/ui';
import type { JSX } from 'react';

import { PageHeader } from '../../../components/app-shell/page-header';

/** Inicio del portal del cliente. Sus pantallas se construyen en B30. */
export default function PortalHomePage(): JSX.Element {
  return (
    <>
      <PageHeader title="Bienvenido" description="Su resumen." />
      <EmptyState
        title="Su portal estará disponible pronto"
        description="Aquí podrá ver el avance de sus proyectos, aprobar entregables, firmar documentos y pedir soporte."
      />
    </>
  );
}
