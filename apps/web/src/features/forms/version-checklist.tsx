'use client';

import { FORM_RECORD_STATUSES } from '@arza/contracts';
import { buttonVariants } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { fillPath, recordPath } from './labels';
import { useFormRecords, useFormTemplates } from './queries';

// La Lista de Verificación Documental (FT-SGC-002) de una versión en revisión (B20): Calidad la
// diligencia y la envía antes de aprobar la revisión. Si el formato no está publicado, no aplica.

const CHECKLIST = 'FT-SGC-002';

export function VersionChecklist({
  versionId,
}: {
  readonly versionId: string;
}): JSX.Element | null {
  const template = useFormTemplates({ code: CHECKLIST, fillable: true }).data?.data[0];
  const records = useFormRecords({
    templateCode: CHECKLIST,
    entityType: 'doc_version',
    entityId: versionId,
  }).data?.data;
  if (template === undefined || records === undefined) return null;
  const [record] = records;
  if (record !== undefined) {
    return (
      <p className="text-sm">
        Lista de verificación:{' '}
        <Link href={recordPath(record.id)} className="text-primary hover:underline">
          {record.code}
        </Link>{' '}
        ({FORM_RECORD_STATUSES[record.status]})
        {record.status === 'completed' ? '' : '. Envíela para poder aprobar la revisión.'}
      </p>
    );
  }
  return (
    <Link
      href={fillPath(template.id, { type: 'doc_version', id: versionId })}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      Diligenciar la Lista de Verificación (FT-SGC-002)
    </Link>
  );
}
