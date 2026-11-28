'use client';

import { DialogFooter } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { RecordDialog, TextInput } from '../organization/record-dialog';
import { PARTY_KEYS } from './queries';

// Aprobar o rechazar lo que registró otra persona: una cuenta bancaria o un conocimiento del
// tercero (doble aprobación, ficha 17.3). A quien lo registró no se le ofrece.

interface ReviewButtonsProps {
  /** Ruta de las acciones, sin «/approve» ni «/reject». */
  readonly path: string;
  /** Qué se revisa, como «la cuenta bancaria». */
  readonly what: string;
  readonly ownRequest: boolean;
  readonly reason: string;
  /** Cuerpo de la aprobación, como la próxima revisión. */
  readonly approveBody?: object;
}

function RejectForm(props: ReviewButtonsProps & { readonly onDone: () => void }): JSX.Element {
  const api = useApiClient();
  const [note, setNote] = useState('');
  const reject = useAdminAction<string>({
    run: (text, csrfToken) => api.post(`${props.path}/reject`, { body: { note: text }, csrfToken }),
    invalidate: [PARTY_KEYS.all],
    onSuccess: props.onDone,
    reason: props.reason,
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    reject.execute(note.trim());
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {reject.error === null ? null : <FormError error={reject.error} />}
      <TextInput
        id="revision-motivo"
        label="Motivo del rechazo"
        hint="Mínimo 5 letras."
        value={note}
        onValue={setNote}
      />
      <DialogFooter>
        <SubmitButton label="Rechazar" pendingLabel="Rechazando…" pending={reject.pending} />
      </DialogFooter>
      {reject.dialog}
    </form>
  );
}

export function ReviewButtons(props: ReviewButtonsProps): JSX.Element {
  const api = useApiClient();
  const approve = useAdminAction<null>({
    run: (_args, csrfToken) =>
      api.post(`${props.path}/approve`, { body: props.approveBody ?? {}, csrfToken }),
    invalidate: [PARTY_KEYS.all],
    reason: props.reason,
  });
  if (props.ownRequest) {
    return (
      <p className="text-xs text-muted-foreground">Usted lo registró: lo revisa otra persona.</p>
    );
  }
  return (
    <>
      <ConfirmActionButton
        label="Aprobar"
        title={`¿Aprobar ${props.what}?`}
        description="La aprobación queda a su nombre en la auditoría."
        confirmLabel="Sí, aprobar"
        disabled={approve.pending}
        onConfirm={() => {
          approve.execute(null);
        }}
      />
      <RecordDialog
        triggerLabel="Rechazar"
        variant="outline"
        size="md"
        title={`Rechazar ${props.what}`}
        description="El motivo queda en la auditoría."
      >
        {(close) => <RejectForm {...props} onDone={close} />}
      </RecordDialog>
      {approve.error === null ? null : <FormError error={approve.error} />}
      {approve.dialog}
    </>
  );
}
