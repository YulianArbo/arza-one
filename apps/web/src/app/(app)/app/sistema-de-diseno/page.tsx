import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PageHeader } from '../../../../components/app-shell/page-header';
import {
  ButtonSection,
  FeedbackSection,
  FormSection,
} from '../../../../features/design-system/component-sections';
import { ChartSection } from '../../../../features/design-system/chart-sections';
import { StateSection } from '../../../../features/design-system/state-section';
import { ColorSection, TypographySection } from '../../../../features/design-system/token-sections';

export const metadata: Metadata = { title: 'Sistema de diseño' };

/** Muestrario del sistema de diseño (16.2) para revisar marca, componentes y estados. */
export default function DesignSystemPage(): JSX.Element {
  return (
    <>
      <PageHeader
        title="Sistema de diseño"
        description="Colores, tipografías, componentes, estados y gráficas de ARZA ONE."
      />
      <ColorSection />
      <TypographySection />
      <ButtonSection />
      <FeedbackSection />
      <FormSection />
      <StateSection />
      <ChartSection />
    </>
  );
}
