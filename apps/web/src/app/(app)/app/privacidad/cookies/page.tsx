import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { CookiesPanel } from '../../../../../features/privacy/cookies-panel';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Cookies' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['privacy.notice.manage']}>
      <PageHeader
        title="Cookies"
        description="Elecciones de cookies de los visitantes del sitio público."
      />
      <CookiesPanel />
    </RequirePermission>
  );
}
