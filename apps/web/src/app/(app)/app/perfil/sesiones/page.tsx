import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { ActiveSessionsPanel } from '../../../../../features/sessions/active-sessions-panel';

export const metadata: Metadata = { title: 'Sesiones activas' };

export default function ActiveSessionsPage(): JSX.Element {
  return (
    <>
      <PageHeader
        title="Sesiones activas"
        description="Dónde tiene abierta su cuenta. Si no reconoce una sesión, ciérrela y cambie su contraseña."
      />
      <ActiveSessionsPanel />
    </>
  );
}
