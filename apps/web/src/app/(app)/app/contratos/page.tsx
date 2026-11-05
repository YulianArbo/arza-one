import type { Metadata } from 'next';
import type { JSX } from 'react';

import { ContractList } from '../../../../features/contracts/contract-list';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Contratos' };

export default function ContractsPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['contract.read']}>
      <ContractList />
    </RequirePermission>
  );
}
