import type { NotificationKind } from '@arza/contracts';

import type { OutboxEvent } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Lo que produce cada evento de la bandeja de salida (numeral 13.3): los avisos para cada persona.

/** Un aviso para una persona, antes de aplicar su plantilla. */
export interface Notice {
  readonly userId: string;
  readonly kind: NotificationKind;
  /** Valores de las variables de la plantilla, salvo {{nombre}}, que es de cada persona. */
  readonly values: Readonly<Record<string, string>>;
  readonly link: string | null;
}

/** Quién se ocupa de un tipo de evento: los avisos que produce. */
export type Handler = (tx: TenantTransaction, event: OutboxEvent, now: Date) => Promise<Notice[]>;
