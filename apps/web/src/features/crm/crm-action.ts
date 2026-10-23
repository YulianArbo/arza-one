'use client';

import type { AdminAction } from '../administration/admin-action';
import { useAdminAction } from '../administration/admin-action';
import { PARTY_KEYS } from '../parties/queries';
import { CRM_KEYS } from './queries';

// Acción del CRM (B22): llama a la API, recarga lo del CRM y los terceros (convertir y ganar los
// cambian) y, si la API lo pide, abre la ventana «Confirme que es usted».

export function useCrmAction<TArgs, TResult = void>(
  run: (args: TArgs, csrfToken: string) => Promise<TResult>,
  onSuccess?: (result: TResult, args: TArgs) => void,
): AdminAction<TArgs, TResult> {
  return useAdminAction<TArgs, TResult>({
    run,
    invalidate: [CRM_KEYS.all, PARTY_KEYS.all],
    reason: 'Los cambios del CRM quedan en la auditoría.',
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}
