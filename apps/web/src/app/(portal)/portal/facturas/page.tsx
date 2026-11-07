import { EmptyState } from '@arza/ui';
import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';

export const metadata: Metadata = { title: 'Facturas' };

/** Facturas del cliente: llegan con la facturación (B31, decisión 1 del B30). No simula datos. */
export default function Page(): JSX.Element {
  return (
    <>
      <PageHeader title="Facturas" description="Facturas electrónicas emitidas a su empresa." />
      <EmptyState
        title="Disponible pronto"
        description="Aquí podrá ver y descargar sus facturas y su soporte fiscal cuando la facturación esté en funcionamiento."
      />
    </>
  );
}
