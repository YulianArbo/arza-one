import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PromptsPage } from '../../../../../features/assistant/assistant-prompts';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Instrucciones del asistente' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['ai.prompt.manage']}>
      <PromptsPage />
    </RequirePermission>
  );
}
