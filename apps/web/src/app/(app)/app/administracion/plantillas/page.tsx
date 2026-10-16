import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { TemplateEditor } from '../../../../../features/notifications/template-editor';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Plantillas de aviso' };

export default function NotificationTemplatesPage(): JSX.Element {
  return (
    <RequirePermission anyOf={['ntf.template.manage']}>
      <PageHeader
        title="Plantillas de aviso"
        description="El asunto y el texto de cada aviso que envía ARZA ONE. Cada cambio guarda una versión nueva; los correos ya enviados conservan la suya."
      />
      <TemplateEditor />
    </RequirePermission>
  );
}
