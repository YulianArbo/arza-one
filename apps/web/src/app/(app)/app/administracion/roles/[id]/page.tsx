import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RoleDetailPanel } from '../../../../../../features/administration/role-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Rol' };

interface RolePageProps {
  params: Promise<{ id: string }>;
}

export default async function RolePage({ params }: RolePageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['iam.role.read']}>
      <RoleDetailPanel id={id} />
    </RequirePermission>
  );
}
