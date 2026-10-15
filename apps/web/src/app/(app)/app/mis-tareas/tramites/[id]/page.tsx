import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RequirePermission } from '../../../../../../features/session/permissions';
import { InstanceDetail } from '../../../../../../features/workflows/instance-detail';

export const metadata: Metadata = { title: 'Trámite' };

interface InstancePageProps {
  params: Promise<{ id: string }>;
}

export default async function InstancePage({ params }: InstancePageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['wf.task.work']}>
      <InstanceDetail id={id} />
    </RequirePermission>
  );
}
