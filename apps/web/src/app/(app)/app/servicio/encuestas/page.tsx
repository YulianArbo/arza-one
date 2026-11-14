import type { Metadata } from 'next';
import type { JSX } from 'react';

import { SurveysPage } from '../../../../../features/service/surveys-page';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Encuestas y NPS' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['service.ticket.read']}>
      <SurveysPage />
    </RequirePermission>
  );
}
