import type { Metadata } from 'next';
import type { JSX } from 'react';

import { NewContract } from '../../../../../features/contracts/contract-wizard';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Nuevo contrato' };

interface NewContractPageProps {
  searchParams: Promise<{ cotizacion?: string }>;
}

/** Contrato nuevo; desde el aviso de una cotización aceptada llega con ?cotizacion=. */
export default async function NewContractPage({
  searchParams,
}: NewContractPageProps): Promise<JSX.Element> {
  const { cotizacion } = await searchParams;
  return (
    <RequirePermission anyOf={['contract.create']}>
      <NewContract quoteId={cotizacion ?? null} />
    </RequirePermission>
  );
}
