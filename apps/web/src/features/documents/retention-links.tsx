'use client';

import { buttonVariants } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { usePermissions } from '../session/permissions';
import { DISPOSITIONS_PATH, RETENTION_PATH } from './labels';

/** Accesos a la tabla de retención y a la disposición final (B21), solo para quien los usa. */
export function RetentionLinks(): JSX.Element {
  const permissions = usePermissions();
  const outline = buttonVariants({ variant: 'outline' });
  return (
    <>
      {permissions.can('doc.retention.manage') ? (
        <Link href={RETENTION_PATH} className={outline}>
          Tabla de retención
        </Link>
      ) : null}
      {permissions.can('doc.disposition.approve') ? (
        <Link href={DISPOSITIONS_PATH} className={outline}>
          Disposición final
        </Link>
      ) : null}
    </>
  );
}
