import type { Metadata } from 'next';
import type { JSX } from 'react';

import { EditContract } from '../../../../../../features/contracts/contract-edit';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Editar el contrato' };

interface EditContractPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditContractPage({
  params,
}: EditContractPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['contract.update']}>
      <EditContract id={id} />
    </RequirePermission>
  );
}
