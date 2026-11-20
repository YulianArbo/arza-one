'use client';

import { purchaseOptionsResponseSchema, type PurchaseOptions } from '@arza/contracts';
import { Button } from '@arza/ui';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { z } from 'zod';

import { useApiClient } from '../../lib/api/api-provider';
import { ActionIcon } from '../../lib/ui/action-icon';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction, type AdminAction } from '../administration/admin-action';
import { LedgerField } from '../finance/ledger-ui';

// Piezas comunes de las pantallas de Compras (B33): consultas, acciones auditadas y el formulario
// de rechazo con motivo, que comparten las solicitudes de compra y los viajes.

const PURCHASE_KEY = ['purchase'] as const;

export function usePurchaseQuery<T>(
  path: string,
  schema: z.ZodType<T>,
  enabled = true,
): UseQueryResult<T> {
  const api = useApiClient();
  return useQuery({
    queryKey: [...PURCHASE_KEY, path],
    queryFn: ({ signal }) => api.get(path, { schema, signal }),
    enabled,
  });
}

export function usePurchaseAction<TArgs, TResult = unknown>(
  run: (args: TArgs, csrfToken: string) => Promise<TResult>,
  onSuccess?: (result: TResult) => void,
): AdminAction<TArgs, TResult> {
  return useAdminAction<TArgs, TResult>({
    run,
    invalidate: [PURCHASE_KEY],
    reason: 'Los cambios de Compras quedan en la auditoría.',
    ...(onSuccess === undefined ? {} : { onSuccess }),
  });
}

/** Centros de costo, proveedores con su verificación y topes vigentes. */
export function usePurchaseOptions(enabled = true): PurchaseOptions | undefined {
  return usePurchaseQuery('/v1/purchase-requests/options', purchaseOptionsResponseSchema, enabled)
    .data?.data;
}

/** Botón de una acción sobre un registro (enviar, aprobar, cerrar), con su error. */
export function PurchaseButton(props: {
  readonly label: string;
  readonly pendingLabel: string;
  readonly ariaLabel: string;
  readonly run: (csrfToken: string) => Promise<unknown>;
}): JSX.Element {
  const action = usePurchaseAction<undefined>((_args, csrfToken) => props.run(csrfToken));
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={props.ariaLabel}
        disabled={action.pending}
        onClick={() => {
          action.execute(undefined);
        }}
      >
        {action.pending ? null : <ActionIcon label={props.label} />}
        {action.pending ? props.pendingLabel : props.label}
      </Button>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

const reasonSchema = z.strictObject({
  reason: z
    .string()
    .trim()
    .min(3, 'Escriba el motivo, con al menos 3 letras.')
    .max(2000, 'El motivo va hasta 2000 letras.'),
});

/** Formulario de rechazo: pide el motivo y lo envía con la versión del registro. */
export function RejectForm(props: {
  readonly fieldId: string;
  readonly submitLabel: string;
  readonly run: (body: { reason: string }, csrfToken: string) => Promise<unknown>;
  readonly onDone: () => void;
}): JSX.Element {
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const action = usePurchaseAction<{ reason: string }>(props.run, props.onDone);
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const valid = reasonSchema.safeParse({ reason });
        setProblem(valid.success ? undefined : valid.error.issues[0]?.message);
        if (valid.success) action.execute(valid.data);
      }}
    >
      <LedgerField
        id={props.fieldId}
        label="Motivo"
        value={reason}
        onChange={setReason}
        error={problem}
      />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton label={props.submitLabel} pendingLabel="Rechazando…" pending={action.pending} />
      {action.dialog}
    </form>
  );
}
