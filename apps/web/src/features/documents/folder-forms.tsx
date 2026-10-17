'use client';

import { classificationSchema } from '@arza/contracts';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { SelectField } from '../administration/select-field';
import { TextInput } from '../organization/record-dialog';
import { useParties } from '../parties/queries';
import { CLASSIFICATION_OPTIONS, classificationHint } from './labels';
import { useCreateFolder } from './queries';

// Carpeta nueva y expediente de un tercero (B18). La carpeta va dentro de la que está abierta en
// el explorador; el expediente se liga a un tercero, que tiene a lo más uno.

interface FolderFormProps {
  readonly parentId: string | null;
  readonly onSaved: (id: string) => void;
}

function nameProblem(name: string): string | null {
  const length = name.trim().length;
  return length < 2 || length > 120 ? 'Escriba un nombre de 2 a 120 caracteres.' : null;
}

/** Nombre y clasificación de la carpeta nueva, y su guardado. */
function useFolderForm({ parentId, onSaved }: FolderFormProps) {
  const [name, setName] = useState('');
  const [classification, setClassification] = useState('internal');
  const [problem, setProblem] = useState<string | null>(null);
  const save = useCreateFolder(onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = nameProblem(name);
    setProblem(found);
    if (found !== null) return;
    save.execute({
      parent_id: parentId,
      name: name.trim(),
      kind: 'folder',
      entity_type: null,
      entity_id: null,
      classification: classificationSchema.parse(classification),
    });
  };
  return { name, setName, classification, setClassification, problem, save, submit };
}

export function NewFolderForm(props: FolderFormProps): JSX.Element {
  const form = useFolderForm(props);
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      <TextInput
        id="carpeta-nombre"
        label="Nombre"
        value={form.name}
        maxLength={120}
        error={form.problem}
        onValue={form.setName}
      />
      <SelectField
        id="carpeta-clasificacion"
        label="Clasificación sugerida para sus documentos"
        hint={classificationHint(form.classification)}
        value={form.classification}
        options={CLASSIFICATION_OPTIONS}
        onChange={(event) => {
          form.setClassification(event.target.value);
        }}
      />
      <SubmitButton label="Crear carpeta" pendingLabel="Creando…" pending={form.save.pending} />
      {form.save.dialog}
    </form>
  );
}

/** Busca el tercero por nombre o identificación entre los que la persona puede ver. */
function PartyPicker(props: {
  readonly value: string;
  readonly error: string | null;
  readonly onChange: (id: string, name: string) => void;
}): JSX.Element {
  const [search, setSearch] = useState('');
  const parties = useParties({ q: search, role: '', status: '' }, null);
  const options = (parties.data?.data ?? []).map((party) => ({
    value: party.id,
    label: party.name,
  }));
  return (
    <div className="flex flex-col gap-3">
      <TextInput
        id="expediente-buscar"
        label="Buscar el tercero"
        value={search}
        onValue={setSearch}
      />
      {parties.isError ? <FormError error={parties.error} /> : null}
      <SelectField
        id="expediente-tercero"
        label="Tercero"
        value={props.value}
        error={props.error ?? undefined}
        options={[{ value: '', label: 'Elija un tercero' }, ...options]}
        onChange={(event) => {
          const chosen = options.find((option) => option.value === event.target.value);
          props.onChange(event.target.value, chosen?.label ?? '');
        }}
      />
    </div>
  );
}

export function NewCaseFileForm({ parentId, onSaved }: FolderFormProps): JSX.Element {
  const [party, setParty] = useState({ id: '', name: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const save = useCreateFolder(onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setProblem(party.id === '' ? 'Elija el tercero del expediente.' : null);
    if (party.id === '') return;
    save.execute({
      parent_id: parentId,
      name: `Expediente de ${party.name}`.slice(0, 120),
      kind: 'case_file',
      entity_type: 'party',
      entity_id: party.id,
      classification: 'confidential',
    });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <PartyPicker
        value={party.id}
        error={problem}
        onChange={(id, name) => {
          setParty({ id, name });
        }}
      />
      <SubmitButton label="Crear expediente" pendingLabel="Creando…" pending={save.pending} />
      {save.dialog}
    </form>
  );
}
