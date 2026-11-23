import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { RequirePermission } from '../../../../../features/session/permissions';
import { PagesPanel } from '../../../../../features/website/pages-panel';

export const metadata: Metadata = { title: 'Páginas del sitio' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['web.page.manage']}>
      <PageHeader
        title="Páginas del sitio"
        description="Páginas institucionales como «Nosotros». Una página publicada se ve en el sitio en su dirección; puede retirarla cuando quiera."
      />
      <PagesPanel />
    </RequirePermission>
  );
}
