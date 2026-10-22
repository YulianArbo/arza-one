'use client';

import { SelectField } from '@arza/ui';
import { FORM_ENTITY_TYPES, formEntityTypeSchema, type FormTemplate } from '@arza/contracts';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { useParties } from '../parties/queries';
import { FormSheet, problemsOf, type FormValues } from './form-sheet';
import { recordPath } from './labels';
import { useCreateFormRecord, useFormTemplate } from './queries';

// Diligenciar un formato (B20): el registro nace como borrador con la versión publicada del
// formato. Lo incompleto se guarda; para enviarlo hace falta lo obligatorio (en su ficha).

interface EntityRef {
  readonly type: string | null;
  readonly id: string | null;
}

/** El tercero del FT-COM-003 cuando no viene de su ficha. */
function PartyChoice(props: {
  readonly value: string;
  readonly error: string | undefined;
  readonly onChange: (id: string) => void;
}): JSX.Element {
  const parties = useParties({ q: '', role: '', status: '' }, null).data?.data ?? [];
  return (
    <SelectField
      id="registro-tercero"
      label="Tercero"
      hint="El formato queda en el conocimiento de este tercero."
      error={props.error}
      value={props.value}
      options={[
        { value: '', label: 'Elija un tercero' },
        ...parties.map((p) => ({ value: p.id, label: p.name })),
      ]}
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
    />
  );
}

function EntityNotice({ template }: { readonly template: FormTemplate }): JSX.Element | null {
  if (template.entity_type === null) return null;
  const origin = FORM_ENTITY_TYPES[template.entity_type].toLowerCase();
  return (
    <p role="alert" className="text-sm text-destructive">
      Este formato se diligencia desde su registro de origen ({origin}).
    </p>
  );
}

/** El registro de origen: el que llega en la dirección o el tercero que se elige aquí. */
function useEntity(template: FormTemplate, given: EntityRef) {
  const [partyId, setPartyId] = useState('');
  const picksParty = template.entity_type === 'party' && given.id === null;
  const entity = picksParty ? { type: 'party', id: partyId === '' ? null : partyId } : given;
  const entityType = formEntityTypeSchema.safeParse(entity.type);
  const missing = template.entity_type !== null && (!entityType.success || entity.id === null);
  return {
    partyId,
    setPartyId,
    picksParty,
    missing,
    type: entityType.success ? entityType.data : null,
    id: entityType.success ? entity.id : null,
  };
}

/** Lo escrito, sus problemas y el envío: un borrador solo exige que cada valor cumpla su tipo. */
function useFill(template: FormTemplate, given: EntityRef) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>({});
  const [tried, setTried] = useState(false);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const entity = useEntity(template, given);
  const create = useCreateFormRecord((id) => {
    router.push(recordPath(id));
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setTried(true);
    const found = problemsOf(template.definition, values, 'draft');
    setProblems(found);
    if (Object.keys(found).length > 0 || entity.missing) return;
    const ref = { entity_type: entity.type, entity_id: entity.id };
    create.execute({ template_id: template.id, data: values, ...ref });
  };
  return { values, setValues, tried, problems, entity, create, submit };
}

function FillForm(props: {
  readonly template: FormTemplate;
  readonly entity: EntityRef;
}): JSX.Element {
  const { template } = props;
  const { values, setValues, tried, problems, entity, create, submit } = useFill(
    template,
    props.entity,
  );
  const partyError = tried && entity.missing ? 'Elija el tercero.' : undefined;
  return (
    <form noValidate onSubmit={submit} className="flex max-w-3xl flex-col gap-6">
      {entity.picksParty ? (
        <PartyChoice value={entity.partyId} error={partyError} onChange={entity.setPartyId} />
      ) : null}
      {entity.missing && !entity.picksParty ? <EntityNotice template={template} /> : null}
      {create.error === null ? null : <FormError error={create.error} />}
      <FormSheet
        definition={template.definition}
        values={values}
        problems={problems}
        onChange={setValues}
      />
      <SubmitButton label="Guardar borrador" pendingLabel="Guardando…" pending={create.pending} />
      {create.dialog}
    </form>
  );
}

export function RecordFill({
  templateId,
  entity,
}: {
  readonly templateId: string;
  readonly entity: EntityRef;
}): JSX.Element {
  const template = useFormTemplate(templateId);
  return (
    <QueryState query={template} loadingLabel="Cargando el formato">
      {(data) => (
        <div className="flex flex-col gap-6">
          <PageHeader
            title={`${data.code} · ${data.name}`}
            description={`Versión ${String(data.form_version)}. Puede guardar el borrador incompleto y terminarlo después.`}
          />
          <FillForm template={data} entity={entity} />
        </div>
      )}
    </QueryState>
  );
}
