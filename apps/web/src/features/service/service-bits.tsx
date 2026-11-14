import Link from 'next/link';
import type { JSX } from 'react';

import { SERVICE_PATHS } from './labels';

// Piezas comunes de las pantallas de la mesa de ayuda (B28).

export function BackLink(): JSX.Element {
  return (
    <Link
      href={SERVICE_PATHS.inbox}
      className="text-sm text-primary underline-offset-4 hover:underline"
    >
      ← Volver a la bandeja
    </Link>
  );
}

/** 1.5 → «1,5 h». */
export function hoursText(value: number): string {
  return `${String(value).replace('.', ',')} h`;
}
