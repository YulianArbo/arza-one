import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequestDetail } from '../../../../../../features/privacy/request-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Solicitud de titular' };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: Props): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['privacy.request.manage']}>
      <RequestDetail id={id} />
    </RequirePermission>
  );
}
