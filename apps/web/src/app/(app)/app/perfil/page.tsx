import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { ProfilePanel } from '../../../../features/profile/profile-panel';

export const metadata: Metadata = { title: 'Mi perfil' };

export default function ProfilePage(): JSX.Element {
  return (
    <>
      <PageHeader title="Mi perfil" description="Sus datos y la seguridad de su cuenta." />
      <ProfilePanel />
    </>
  );
}
