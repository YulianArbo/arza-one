import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ContractDetailPanel } from '../../../../../features/contracts/contract-detail';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Ficha del contrato' };

interface ContractPageProps {
  params: Promise<{ id: string }>;
}

export default async function ContractPage({ params }: ContractPageProps): Promise<JSX.Element> {
  const { id } = await params;
  return (
    <RequirePermission anyOf={['contract.read']}>
      <ContractDetailPanel id={id} />
    </RequirePermission>
  );
}
