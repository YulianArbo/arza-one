import type { Metadata } from 'next';
import type { JSX } from 'react';

import { PublicSurveyPage } from '../../../features/care-site/public-survey';

export const metadata: Metadata = { title: 'Encuesta de satisfacción' };

export default function SurveyPage(): JSX.Element {
  return <PublicSurveyPage />;
}
