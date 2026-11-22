import type { Metadata } from 'next';
import type { JSX } from 'react';

import { InnovationRoadmap } from '../../../../../features/innovation/innovation-roadmap';
import { RequirePermission } from '../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Hoja de ruta de productos' };

export default function Page(): JSX.Element {
  return (
    <RequirePermission anyOf={['inn.read']}>
      <InnovationRoadmap />
    </RequirePermission>
  );
}
