'use client';

import { createdResponseSchema, type PartyDetail } from '@arza/contracts';
import { Alert, AlertDescription, AlertTitle, Button } from '@arza/ui';
import { CircleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { SelectField } from '../administration/select-field';
import { DUPLICATE_REASON_LABELS, KIND_LABELS, identification, partyPath } from './labels';
import { PartyFields, RoleChoices } from './party-form-fields';
import {
  EMPTY_PARTY,
  duplicateQuery,
  fieldErrors,
  partyBody,
  valuesOf,
  type FieldErrors,
  type PartyFormValues,
} from './party-form-values';
import { PARTY_KEYS, useDuplicates } from './queries';

const REASON = 'Los datos de terceros quedan en la auditoría.';

/** Posibles duplicados de lo que se está escribiendo, con un enlace para abrirlos (ficha 17.3). */
function DuplicateWarning({ query }: { readonly query: string }): JSX.Element | null {
  const matches = useDuplicates(query).data?.data ?? [];
  if (matches.length === 0) return null;
  return (
    <Alert tone="warning" role="status">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Puede que este tercero ya exista</AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-1">
          {matches.map(({ party, reasons }) => (
            <li key={party.id}>
              <Link href={partyPath(party.id)} className="font-medium text-primary underline">
                Abrir {party.name}
              </Link>{' '}
              ({identification(party)}): {reasons.map((r) => DUPLICATE_REASON_LABELS[r]).join(', ')}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function useSaveParty(party: PartyDetail | null, onSaved: (id: string) => void) {
  const api = useApiClient();
  return useAdminAction<PartyFormValues, string>({
    run: async (values, csrfToken) => {
      if (party === null) {
        const body = { ...partyBody(values), roles: values.roles, status: values.status };
        const created = await api.post('/v1/parties', {
          body,
          schema: createdResponseSchema,
          csrfToken,
        });
        return created.id;
      }
      await api.patch(`/v1/parties/${party.id}`, {
        body: partyBody(values),
        version: party.version,
        csrfToken,
      });
      return party.id;
    },
    invalidate: [PARTY_KEYS.all],
    onSuccess: onSaved,
    reason: REASON,
  });
}

function KindChoice(props: {
  readonly values: PartyFormValues;
  readonly onChange: (values: PartyFormValues) => void;
}): JSX.Element {
  return (
    <SelectField
      id="tercero-tipo"
      label="Tipo de tercero"
      options={[
        { value: 'organization', label: KIND_LABELS.organization },
        { value: 'person', label: KIND_LABELS.person },
      ]}
      value={props.values.kind}
      onChange={(event) => {
        const kind = event.target.value === 'person' ? 'person' : 'organization';
        props.onChange({ ...props.values, kind, idType: kind === 'person' ? 'CC' : 'NIT' });
      }}
    />
  );
}

function CreateOnlyFields(props: {
  readonly values: PartyFormValues;
  readonly onChange: (values: PartyFormValues) => void;
}): JSX.Element {
  const { values, onChange } = props;
  return (
    <>
      <RoleChoices
        roles={values.roles}
        onChange={(roles) => {
          onChange({ ...values, roles });
        }}
      />
      <SelectField
        id="tercero-estado-inicial"
        label="Estado inicial"
        options={[
          { value: 'active', label: 'Activo' },
          { value: 'prospect', label: 'Prospecto' },
        ]}
        value={values.status}
        onChange={(event) => {
          onChange({
            ...values,
            status: event.target.value === 'prospect' ? 'prospect' : 'active',
          });
        }}
      />
    </>
  );
}

interface PartyFormProps {
  /** null para registrar uno nuevo. */
  readonly party: PartyDetail | null;
  /** Al guardar; por defecto, al registrar abre la ficha del nuevo tercero. */
  readonly onSaved?: () => void;
}

function FormButtons(props: { readonly pending: boolean; readonly creating: boolean }) {
  const router = useRouter();
  return (
    <div className="flex gap-2">
      <SubmitButton label="Guardar" pendingLabel="Guardando…" pending={props.pending} />
      {props.creating ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.back();
          }}
        >
          Cancelar
        </Button>
      ) : null}
    </div>
  );
}

/** Estado del formulario: valores, problemas por campo, búsqueda de duplicados y guardado. */
function usePartyForm({ party, onSaved }: PartyFormProps) {
  const router = useRouter();
  const [values, setValues] = useState(party === null ? EMPTY_PARTY : valuesOf(party));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [probe, setProbe] = useState('');
  const save = useSaveParty(party, (id) => {
    if (onSaved === undefined) router.push(partyPath(id));
    else onSaved();
  });
  const refreshProbe = (): void => {
    setProbe(duplicateQuery(values, party?.id ?? null));
  };
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = fieldErrors(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    refreshProbe();
    save.execute(values);
  };
  return { values, setValues, errors, probe, refreshProbe, save, submit };
}

/** Registrar o editar un tercero (ficha 17.3, numeral 16.4: patrón de formulario). */
export function PartyForm(props: PartyFormProps): JSX.Element {
  const creating = props.party === null;
  const form = usePartyForm(props);
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      {Object.keys(form.errors).length > 0 ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          Revise los datos marcados antes de guardar.
        </p>
      ) : null}
      {creating ? <KindChoice values={form.values} onChange={form.setValues} /> : null}
      <PartyFields
        values={form.values}
        errors={form.errors}
        onChange={form.setValues}
        onProbe={form.refreshProbe}
      />
      {creating ? <CreateOnlyFields values={form.values} onChange={form.setValues} /> : null}
      <DuplicateWarning query={form.probe} />
      <FormButtons pending={form.save.pending} creating={creating} />
      {form.save.dialog}
    </form>
  );
}
