import { EmptyState } from '@arza/ui';
import type { JSX } from 'react';

/** Inicio del portal del cliente. Sus pantallas se construyen en B30. */
export default function PortalHomePage(): JSX.Element {
  return (
    <>
      <h1 className="font-heading text-2xl font-bold">Bienvenido</h1>
      <EmptyState
        title="Su portal estará disponible pronto"
        description="Aquí podrá ver el avance de sus proyectos, aprobar entregables, firmar documentos y pedir soporte."
      />
    </>
  );
}
