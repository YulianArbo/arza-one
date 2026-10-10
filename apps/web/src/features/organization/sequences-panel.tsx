'use client';

import { createdResponseSchema, sequenceSchema, type Sequence } from '@arza/contracts';
import { DialogFooter, EmptyState, TableCell, TableRow } from '@arza/ui';
import { Hash } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { SimpleTable } from '../administration/simple-table';
import { CORE_KEYS, useSequences } from './queries';
import { RecordDialog, TextInput } from './record-dialog';

interface SequenceValues {
  readonly key: string;
  readonly name: string;
  readonly prefix: string;
  readonly padding: string;
}

function useSaveSequence(sequence: Sequence | null, onSaved: () => void) {
  const api = useApiClient();
  return useAdminAction<SequenceValues, unknown>({
    run: (v, csrfToken) => {
      const fields = {
        name: v.name.trim(),
        prefix: v.prefix.trim().toUpperCase(),
        padding: Number(v.padding),
      };
      if (sequence === null) {
        const body = { ...fields, key: v.key.trim() };
        return api.post('/v1/sequences', { body, schema: createdResponseSchema, csrfToken });
      }
      const options = {
        body: fields,
        version: sequence.version,
        schema: sequenceSchema,
        csrfToken,
      };
      return api.patch(`/v1/sequences/${sequence.id}`, options);
    },
    invalidate: [CORE_KEYS.sequences],
    onSuccess: onSaved,
  });
}

const SEQUENCE_FIELDS: readonly {
  readonly name: keyof SequenceValues;
  readonly label: string;
  readonly hint: string;
}[] = [
  { name: 'name', label: 'Nombre', hint: 'Por ejemplo «Cotizaciones».' },
  {
    name: 'key',
    label: 'Clave técnica',
    hint: 'La usa el módulo, por ejemplo crm.quote. No se cambia después.',
  },
  { name: 'prefix', label: 'Prefijo', hint: 'De 2 a 6 letras, por ejemplo COT.' },
  {
    name: 'padding',
    label: 'Dígitos del número',
    hint: 'Entre 3 y 8. Con 4 dígitos: COT-2026-0001.',
  },
];

function SequenceFields(props: {
  readonly values: SequenceValues;
  readonly onChange: (values: SequenceValues) => void;
  readonly editing: boolean;
}): JSX.Element {
  const { values, onChange } = props;
  return (
    <>
      {SEQUENCE_FIELDS.map((field) => (
        <TextInput
          key={field.name}
          id={`consecutivo-${field.name}`}
          label={field.label}
          hint={field.hint}
          disabled={props.editing && field.name === 'key'}
          inputMode={field.name === 'padding' ? 'numeric' : undefined}
          value={values[field.name]}
          onValue={(value) => {
            onChange({ ...values, [field.name]: value });
          }}
        />
      ))}
    </>
  );
}

function SequenceForm(props: { readonly sequence: Sequence | null; readonly onSaved: () => void }) {
  const { sequence } = props;
  const [values, setValues] = useState<SequenceValues>({
    key: sequence?.key ?? '',
    name: sequence?.name ?? '',
    prefix: sequence?.prefix ?? '',
    padding: String(sequence?.padding ?? 4),
  });
  const save = useSaveSequence(sequence, props.onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute(values);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <SequenceFields values={values} onChange={setValues} editing={sequence !== null} />
      <DialogFooter>
        <SubmitButton label="Guardar" pendingLabel="Guardando…" pending={save.pending} />
      </DialogFooter>
      {save.dialog}
    </form>
  );
}

function SequenceRow({ sequence }: { readonly sequence: Sequence }): JSX.Element {
  return (
    <TableRow>
      <TableCell className="font-medium">{sequence.name}</TableCell>
      <TableCell className="font-mono text-xs">{sequence.key}</TableCell>
      <TableCell>{sequence.year}</TableCell>
      <TableCell className="font-mono">{sequence.next_code}</TableCell>
      <TableCell>
        <RecordDialog
          triggerLabel="Editar"
          triggerAriaLabel={`Editar ${sequence.name}`}
          variant="outline"
          title={`Editar ${sequence.name}`}
          description="El siguiente número no se cambia a mano: así no hay saltos ni repetidos."
        >
          {(close) => <SequenceForm sequence={sequence} onSaved={close} />}
        </RecordDialog>
      </TableCell>
    </TableRow>
  );
}

/** Consecutivos de negocio (ADR-021): PREFIJO-AAAA-NNNN, sin saltos ni duplicados. */
export function SequencesPanel(): JSX.Element {
  const sequences = useSequences();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <RecordDialog
          triggerLabel="Agregar un consecutivo"
          title="Agregar un consecutivo"
          description="Cada año la numeración vuelve a empezar en 1."
        >
          {(close) => <SequenceForm sequence={null} onSaved={close} />}
        </RecordDialog>
      </div>
      <QueryState query={sequences} loadingLabel="Cargando los consecutivos">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<Hash />}
              title="Todavía no hay consecutivos"
              description="Cada módulo crea los suyos al construirse; también puede agregarlos aquí."
            />
          ) : (
            <SimpleTable headers={['Nombre', 'Clave', 'Año', 'Siguiente código', '']}>
              {data.data.map((sequence) => (
                <SequenceRow key={sequence.id} sequence={sequence} />
              ))}
            </SimpleTable>
          )
        }
      </QueryState>
    </div>
  );
}
