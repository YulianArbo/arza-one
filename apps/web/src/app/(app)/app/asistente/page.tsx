import type { Metadata } from 'next';
import type { JSX } from 'react';

import { AssistantHome } from '../../../../features/assistant/assistant-home';
import { RequirePermission } from '../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Asistente' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission
      anyOf={['ai.assist.use', 'ai.use_case.manage', 'ai.prompt.manage', 'ai.request.read']}
    >
      <AssistantHome />
    </RequirePermission>
  );
}
