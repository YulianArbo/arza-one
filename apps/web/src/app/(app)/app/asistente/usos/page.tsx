import type { Metadata } from 'next';
import type { JSX } from 'react';

import { UseCasesPage } from '../../../../../features/assistant/assistant-use-cases';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Usos activos del asistente' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['ai.use_case.manage']}>
      <UseCasesPage />
    </RequirePermission>
  );
}
