import type { Metadata } from 'next';
import type { JSX } from 'react';

import { QualityLessons } from '../../../../../features/quality/quality-lessons';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Lecciones aprendidas' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['qms.lesson.read']}>
      <QualityLessons />
    </RequirePermission>
  );
}
