import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import { RequirePermission } from '../../../../features/session/permissions';
import { WebsiteHome } from '../../../../features/website/website-home';

export const metadata: Metadata = { title: 'Sitio web' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission
      anyOf={[
        'web.page.manage',
        'web.legal_text.manage',
        'web.legal_text.publish',
        'web.submission.read',
      ]}
    >
      <PageHeader
        title="Sitio web"
        description="Las páginas, los textos legales y los formularios del sitio público de la empresa."
      />
      <WebsiteHome />
    </RequirePermission>
  );
}
