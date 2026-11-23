import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../../components/app-shell/page-header';
import { RequirePermission } from '../../../../../features/session/permissions';
import { LegalTextsPanel } from '../../../../../features/website/legal-texts-panel';

export const metadata: Metadata = { title: 'Textos legales' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['web.legal_text.manage', 'web.legal_text.publish']}>
      <PageHeader
        title="Textos legales"
        description="Cada texto tiene versiones: se redacta en borrador, lo aprueba otra persona y al publicarlo reemplaza al vigente. Publique solo con el concepto del asesor jurídico."
      />
      <LegalTextsPanel />
    </RequirePermission>
  );
}
