'use client';

import { PARTY_STATUS_TRANSITIONS, type PartyDetail, type PartyStatus } from '@arza/contracts';
import { DialogFooter } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { RecordDialog, TextInput } from '../organization/record-dialog';
import { STATUS_LABELS, statusActionLabel } from './labels';
import { PARTY_KEYS } from './queries';

// Botones solo de los cambios de estado permitidos (numeral 16.4, patrón de detalle):
// prospecto → activo → inactivo → bloqueado; bloquear pide el motivo.

interface Change {
  readonly status: PartyStatus;
  readonly reason: string | null;
}

function useChangeStatus(party: PartyDetail, onDone: () => void) {
  const api = useApiClient();
  return useAdminAction<Change>({
    run: (change, csrfToken) =>
      api.post(`/v1/parties/${party.id}/actions/change-status`, {
        body: change,
        version: party.version,
        csrfToken,
      }),
    invalidate: [PARTY_KEYS.all],
    onSuccess: onDone,
    reason: 'El cambio de estado queda en la auditoría.',
  });
}

function BlockForm({
  party,
  onDone,
}: {
  readonly party: PartyDetail;
  readonly onDone: () => void;
}): JSX.Element {
  const [reason, setReason] = useState('');
  const change = useChangeStatus(party, onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    change.execute({ status: 'blocked', reason: reason.trim() });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {change.error === null ? null : <FormError error={change.error} />}
      <TextInput
        id="tercero-motivo-bloqueo"
        label="Motivo del bloqueo"
        hint="Por ejemplo: aparece en una lista restrictiva. Mínimo 5 letras."
        value={reason}
        onValue={setReason}
      />
      <DialogFooter>
        <SubmitButton label="Bloquear" pendingLabel="Bloqueando…" pending={change.pending} />
      </DialogFooter>
      {change.dialog}
    </form>
  );
}

export function StatusActions({ party }: { readonly party: PartyDetail }): JSX.Element {
  const change = useChangeStatus(party, () => undefined);
  return (
    <>
      {PARTY_STATUS_TRANSITIONS[party.status].map((status) =>
        status === 'blocked' ? (
          <RecordDialog
            key={status}
            triggerLabel="Bloquear"
            variant="outline"
            title={`Bloquear a ${party.name}`}
            description="Un tercero bloqueado no se usa en nuevas operaciones. El motivo queda en la auditoría."
          >
            {(close) => <BlockForm party={party} onDone={close} />}
          </RecordDialog>
        ) : (
          <ConfirmActionButton
            key={status}
            label={statusActionLabel(party.status, status)}
            title={`¿${statusActionLabel(party.status, status)} a ${party.name}?`}
            description={`Quedará en estado «${STATUS_LABELS[status]}». El cambio queda en la auditoría.`}
            confirmLabel={`Sí, ${statusActionLabel(party.status, status).toLowerCase()}`}
            disabled={change.pending}
            onConfirm={() => {
              change.execute({ status, reason: null });
            }}
          />
        ),
      )}
      {change.error === null ? null : <FormError error={change.error} />}
      {change.dialog}
    </>
  );
}
