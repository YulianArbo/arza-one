'use client';

import { chainVerificationSchema, type ChainVerification } from '@arza/contracts';
import { Alert, AlertDescription, AlertTitle, Button } from '@arza/ui';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { JSX } from 'react';

import { formatDateTime } from '../../lib/format/date-time';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { useAdminAction } from '../administration/admin-action';
import { AUDIT_KEYS } from './queries';
import { CHAIN_PROBLEM_LABELS } from './labels';

function Result({ result }: { readonly result: ChainVerification }): JSX.Element {
  const when = formatDateTime(result.verified_at);
  const count = result.checked.toLocaleString('es-CO');
  if (result.intact) {
    return (
      <Alert tone="success">
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>La auditoría está íntegra</AlertTitle>
        <AlertDescription>
          Revisamos {count} eventos el {when}: ninguno falta, sobra ni fue modificado.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert tone="destructive" role="alert">
      <ShieldAlert aria-hidden="true" />
      <AlertTitle>La auditoría fue alterada</AlertTitle>
      <AlertDescription>
        <p>
          {result.problem === null ? '' : CHAIN_PROBLEM_LABELS[result.problem]} Primer evento
          dañado: número {result.broken_seq ?? '—'}. Revisamos {count} eventos el {when}.
        </p>
        <p>
          Quedó registrado como evento de seguridad crítico. Informe de inmediato al líder técnico.
        </p>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Verificación de la integridad de la auditoría (audit.chain.verify): recalcula el sello de cada
 * evento. El worker la hace también todos los días a las 3:00 a. m.
 */
export function ChainVerificationPanel(): JSX.Element {
  const api = useApiClient();
  const action = useAdminAction<undefined, ChainVerification>({
    run: (_args, csrfToken) =>
      api.post('/v1/audit-events/verify-chain', {
        body: {},
        csrfToken,
        schema: chainVerificationSchema,
      }),
    invalidate: [AUDIT_KEYS.security],
  });
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Cada evento guarda un sello calculado con su contenido y el sello del evento anterior. Si
        alguien modifica o borra un evento, los sellos dejan de coincidir y la verificación lo
        detecta.
      </p>
      <div>
        <Button
          type="button"
          disabled={action.pending}
          onClick={() => {
            action.execute(undefined);
          }}
        >
          {action.pending ? 'Verificando…' : 'Verificar ahora'}
        </Button>
      </div>
      <div aria-live="polite">
        {action.result === undefined ? null : <Result result={action.result} />}
      </div>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}
