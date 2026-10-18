import type { Metadata } from 'next';
import type { JSX } from 'react';

import { RecordFill } from '../../../../../../features/forms/record-fill';
import { RequirePermission } from '../../../../../../features/session/permissions';

export const metadata: Metadata = { title: 'Diligenciar formato' };

type Param = string | string[] | undefined;

interface FillPageProps {
  searchParams: Promise<{ formato?: Param; tipo?: Param; registro?: Param }>;
}

function single(value: Param): string | null {
  return typeof value === 'string' ? value : null;
}

export default async function FillPage({ searchParams }: FillPageProps): Promise<JSX.Element> {
  const { formato, tipo, registro } = await searchParams;
  return (
    <RequirePermission anyOf={['doc.form_record.create']}>
      <RecordFill
        templateId={single(formato) ?? ''}
        entity={{ type: single(tipo), id: single(registro) }}
      />
    </RequirePermission>
  );
}
