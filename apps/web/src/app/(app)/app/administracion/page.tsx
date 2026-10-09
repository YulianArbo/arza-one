import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { AdminHome } from '../../../../features/administration/admin-home';

export const metadata: Metadata = { title: 'Administración' };

export default function AdministrationPage(): JSX.Element {
  return (
    <>
      <PageHeader
        title="Administración"
        description="Usuarios, roles y accesos de la empresa. Solo ve las secciones que su rol le permite."
      />
      <AdminHome />
    </>
  );
}
