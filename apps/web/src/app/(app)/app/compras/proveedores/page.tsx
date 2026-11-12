import type { Metadata } from 'next';
import type { JSX } from 'react';

import { EvaluationsPanel } from '../../../../../features/purchases/evaluations-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Evaluación de proveedores' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['purchase.read']}>
      <EvaluationsPanel />
    </RequirePermission>
  );
}
