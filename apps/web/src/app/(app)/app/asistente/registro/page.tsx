import type { Metadata } from 'next';
import type { JSX } from 'react';

import { UsagePage } from '../../../../../features/assistant/assistant-usage';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Registro de usos del asistente' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['ai.request.read']}>
      <UsagePage />
    </RequirePermission>
  );
}
