import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityContext } from '../../../../../features/quality/quality-context';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Contexto y partes interesadas' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['qms.read']}>
      <QualityContext />
    </RequirePermission>
  );
}
