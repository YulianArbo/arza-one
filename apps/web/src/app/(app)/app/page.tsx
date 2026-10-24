import type { JSX } from 'react';

import { PageHeader } from '../../../components/app-shell/page-header';
import { HomeDashboard } from '../../../features/home/home-dashboard';

export default function HomePage(): JSX.Element {
  return (
    <>
      <PageHeader title="Inicio" description="Su resumen del día." />
      <HomeDashboard />
    </>
  );
}
