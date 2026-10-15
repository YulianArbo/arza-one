'use client';

import type { PartyDetail, PartySearchResponse, PartySummary } from '@arza/contracts';
import { DialogFooter, TableCell, TableRow } from '@arza/ui';
import { useState, type JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { SimpleTable } from '../administration/simple-table';
import { RecordDialog } from '../organization/record-dialog';
import { DUPLICATE_REASON_LABELS, ROLE_LABELS, STATUS_LABELS, identification } from './labels';
import { PARTY_KEYS, queryString, useDuplicates } from './queries';

// Fusión de duplicados (ficha 17.3): se elige el duplicado entre los posibles, se comparan lado a
// lado y, al confirmar, todo lo del duplicado pasa a este tercero. El historial de ambos se ve.

type Candidates = PartySearchResponse['data'];

const COMPARED: readonly (readonly [string, (p: PartySummary) => string])[] = [
  ['Nombre', (p) => p.name],
  ['Documento', identification],
  ['Correo', (p) => p.email ?? '—'],
  ['Teléfono', (p) => p.phone ?? '—'],
  ['Ciudad', (p) => p.city ?? '—'],
  ['Estado', (p) => STATUS_LABELS[p.status]],
  ['Papeles', (p) => p.roles.map((role) => ROLE_LABELS[role]).join(', ') || '—'],
];

function probeOf(party: PartyDetail): string {
  return queryString({
    id_number: party.id_number,
    name: party.name,
    email: party.email,
    phone: party.phone,
    exclude_id: party.id,
  });
}

function Comparison(props: { readonly party: PartyDetail; readonly duplicate: PartySummary }) {
  return (
    <SimpleTable
      headers={['Dato', 'Se conserva', 'Duplicado']}
      caption="Comparación de los dos registros"
    >
      {COMPARED.map(([label, value]) => (
        <TableRow key={label}>
          <TableCell className="text-muted-foreground">{label}</TableCell>
          <TableCell>{value(props.party)}</TableCell>
          <TableCell>{value(props.duplicate)}</TableCell>
        </TableRow>
      ))}
    </SimpleTable>
  );
}

function CandidateChoice(props: {
  readonly candidates: Candidates;
  readonly chosenId: string | null;
  readonly onChoose: (id: string) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">¿Cuál es el duplicado?</legend>
      {props.candidates.map(({ party, reasons }) => (
        <label key={party.id} className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="duplicado"
            value={party.id}
            checked={props.chosenId === party.id}
            onChange={() => {
              props.onChoose(party.id);
            }}
          />
          <span>
            {party.name} ({identification(party)}):{' '}
            {reasons.map((reason) => DUPLICATE_REASON_LABELS[reason]).join(', ')}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function MergeChoice(props: {
  readonly party: PartyDetail;
  readonly candidates: Candidates;
  readonly pending: boolean;
  readonly onMerge: (duplicateId: string) => void;
}): JSX.Element {
  const [chosenId, setChosenId] = useState<string | null>(null);
  if (props.candidates.length === 0) {
    return <p className="text-sm">No se encontraron posibles duplicados de este tercero.</p>;
  }
  const chosen = props.candidates.find((row) => row.party.id === chosenId)?.party;
  return (
    <>
      <CandidateChoice candidates={props.candidates} chosenId={chosenId} onChoose={setChosenId} />
      {chosen === undefined ? null : <Comparison party={props.party} duplicate={chosen} />}
      <DialogFooter>
        <ConfirmActionButton
          label="Fusionar"
          title={`¿Fusionar ${chosen?.name ?? 'el duplicado'} en ${props.party.name}?`}
          description="Sus papeles, contactos, cuentas y conocimiento pasan a este tercero y el duplicado deja de usarse. El historial de ambos se conserva. No se puede deshacer."
          confirmLabel="Sí, fusionar"
          disabled={chosen === undefined || props.pending}
          onConfirm={() => {
            if (chosen !== undefined) props.onMerge(chosen.id);
          }}
        />
      </DialogFooter>
    </>
  );
}

function MergeForm(props: { readonly party: PartyDetail; readonly onDone: () => void }) {
  const api = useApiClient();
  const candidates = useDuplicates(probeOf(props.party));
  const merge = useAdminAction<string>({
    run: (duplicateId, csrfToken) =>
      api.post(`/v1/parties/${props.party.id}/merge`, {
        body: { duplicate_id: duplicateId },
        csrfToken,
      }),
    invalidate: [PARTY_KEYS.all],
    onSuccess: props.onDone,
    reason: 'La fusión queda en la auditoría.',
  });
  return (
    <div className="flex flex-col gap-4">
      {merge.error === null ? null : <FormError error={merge.error} />}
      <QueryState query={candidates} loadingLabel="Buscando posibles duplicados">
        {({ data }) => (
          <MergeChoice
            party={props.party}
            candidates={data}
            pending={merge.pending}
            onMerge={merge.execute}
          />
        )}
      </QueryState>
      {merge.dialog}
    </div>
  );
}

export function MergeDialog({ party }: { readonly party: PartyDetail }): JSX.Element {
  return (
    <RecordDialog
      triggerLabel="Fusionar un duplicado"
      variant="outline"
      title={`Fusionar un duplicado en ${party.name}`}
      description={`${party.name} se conserva; el duplicado se integra en él.`}
    >
      {(close) => <MergeForm party={party} onDone={close} />}
    </RecordDialog>
  );
}
