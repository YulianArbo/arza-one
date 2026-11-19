import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequestsPanel } from '../../../../../features/purchases/requests-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Solicitudes de compra' };

interface RequestsPageProps {
  searchParams: Promise<{ nueva?: string }>;
}

/** `?nueva=1` abre el formulario de una solicitud nueva (botón de la portada, B22B). */
export default async function Page({ searchParams }: RequestsPageProps): Promise<JSX.Element> {
  const { nueva } = await searchParams;
  return (
    <RequirePermission anyOf={['purchase.read', 'purchase.request.create']}>
      <RequestsPanel startNew={nueva === '1'} />
    </RequirePermission>
  );
}
