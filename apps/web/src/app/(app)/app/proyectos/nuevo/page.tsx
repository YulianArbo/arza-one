import type { Metadata } from 'next';
import type { JSX } from 'react';

import { NewProject } from '../../../../../features/projects/project-wizard';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Nuevo proyecto' };

interface NewProjectPageProps {
  searchParams: Promise<{ contrato?: string }>;
}

/** Proyecto nuevo; desde «Contratos vigentes sin proyecto» llega con ?contrato=. */
export default async function NewProjectPage({
  searchParams,
}: NewProjectPageProps): Promise<JSX.Element> {
  const { contrato } = await searchParams;
  return (
    <RequirePermission anyOf={['project.create']}>
      <NewProject contractId={contrato ?? null} />
    </RequirePermission>
  );
}
