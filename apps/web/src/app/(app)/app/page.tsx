import type { JSX } from 'react';

import { HomeDashboard } from '../../../features/home/home-dashboard';
import { HomeHeader } from '../../../features/home/home-header';

export default function HomePage(): JSX.Element {
  return (
    <>
      <HomeHeader />
      <HomeDashboard />
    </>
  );
}
