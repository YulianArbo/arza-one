import type { Metadata } from 'next';
import type { JSX } from 'react';

import { UserDetailPanel } from '../../../../../../features/administration/user-detail';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Ficha de usuario' };

interface UserPageProps {
  params: Promise<{ id: string }>;
}

export default async function UserPage({ params }: UserPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['iam.user.read']}>
      <UserDetailPanel id={id} />
    </RequirePermission>
  );
}
