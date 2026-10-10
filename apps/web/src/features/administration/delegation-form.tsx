'use client';

import {
  APPROVAL_PERMISSIONS,
  createdResponseSchema,
  permissionDefinition,
  userListResponseSchema,
} from '@arza/contracts';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import { useQuery } from '@tanstack/react-query';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError, FormSuccess } from '../access/form-alert';
import { FormField } from '../access/form-field';
import { usePermissions } from '../session/permissions';
import { useAdminAction } from './admin-action';
import { endOfBogotaDay, personName, startOfBogotaDay } from './labels';
import { ADMIN_KEYS } from './queries';
import { SelectField } from './select-field';

interface FormValues {
  readonly from: string;
  readonly to: string;
  readonly starts: string;
  readonly ends: string;
  readonly reason: string;
  readonly permissions: readonly string[];
}

interface Option {
  readonly value: string;
  readonly label: string;
}

/** Personas internas activas, para quien administra las delegaciones de todos. */
function useActivePeople(enabled: boolean): Option[] {
  const api = useApiClient();
  const people = useQuery({
    queryKey: [...ADMIN_KEYS.users, 'activos-internos'],
    queryFn: ({ signal }) =>
      api.get('/v1/users?status=active&kind=internal&limit=100', {
        schema: userListResponseSchema,
        signal,
      }),
    enabled,
  });
  return (people.data?.data ?? []).map((person) => ({
    value: person.id,
    label: personName(person),
  }));
}

function todayInBogota(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

function bodyOf(values: FormValues, manageAll: boolean): object {
  return {
    ...(manageAll && values.from !== '' ? { from_user_id: values.from } : {}),
    ...(manageAll ? { to_user_id: values.to } : { to_email: values.to.trim() }),
    starts_at: startOfBogotaDay(values.starts),
    ends_at: endOfBogotaDay(values.ends),
    reason: values.reason.trim(),
    permissions: values.permissions,
  };
}

interface FieldsProps {
  readonly values: FormValues;
  readonly set: (patch: Partial<FormValues>) => void;
}

function DelegateEmailField({ values, set }: FieldsProps): JSX.Element {
  return (
    <FormField
      id="delega-a"
      label="Correo de quien recibe"
      type="email"
      value={values.to}
      onChange={(event) => {
        set({ to: event.target.value });
      }}
    />
  );
}

/** Quién delega y a quién: con la lista de personas para el administrador, o por correo. */
function PeopleFields({
  values,
  set,
  people,
}: FieldsProps & { people: Option[] | null }): JSX.Element {
  if (people === null) return <DelegateEmailField values={values} set={set} />;
  return (
    <>
      <SelectField
        id="delega-de"
        label="Quién delega"
        options={[{ value: '', label: 'Usted' }, ...people]}
        value={values.from}
        onChange={(event) => {
          set({ from: event.target.value, permissions: [] });
        }}
      />
      <SelectField
        id="delega-a"
        label="A quién"
        options={[{ value: '', label: 'Elija una persona' }, ...people]}
        value={values.to}
        onChange={(event) => {
          set({ to: event.target.value });
        }}
      />
    </>
  );
}

function PeriodFields({ values, set }: FieldsProps): JSX.Element {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          id="delega-desde"
          label="Desde"
          type="date"
          value={values.starts}
          onChange={(event) => {
            set({ starts: event.target.value });
          }}
        />
        <FormField
          id="delega-hasta"
          label="Hasta (máximo 60 días)"
          type="date"
          value={values.ends}
          onChange={(event) => {
            set({ ends: event.target.value });
          }}
        />
      </div>
      <FormField
        id="delega-motivo"
        label="Motivo"
        hint="Por ejemplo: vacaciones del 15 al 30 de diciembre."
        value={values.reason}
        onChange={(event) => {
          set({ reason: event.target.value });
        }}
      />
    </>
  );
}

function ApprovalChoices({
  codes,
  values,
  set,
}: FieldsProps & { codes: readonly string[] }): JSX.Element {
  if (codes.length === 0)
    return <p className="text-sm">Usted no tiene aprobaciones que delegar.</p>;
  const toggle = (code: string, checked: boolean): void => {
    const rest = values.permissions.filter((item) => item !== code);
    set({ permissions: checked ? [...rest, code] : rest });
  };
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium">Aprobaciones que se delegan</legend>
      {codes.map((code) => (
        <label key={code} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={values.permissions.includes(code)}
            onChange={(event) => {
              toggle(code, event.target.checked);
            }}
          />
          {permissionDefinition(code).description}
        </label>
      ))}
    </fieldset>
  );
}

function useCreateDelegation(onDone: () => void) {
  const api = useApiClient();
  return useAdminAction<object, unknown>({
    run: (body, csrfToken) =>
      api.post('/v1/delegations', { body, schema: createdResponseSchema, csrfToken }),
    invalidate: [ADMIN_KEYS.delegations],
    onSuccess: onDone,
  });
}

function useDelegationForm() {
  const permissions = usePermissions();
  const manageAll = permissions.canAll('iam.delegation.manage');
  const people = useActivePeople(manageAll);
  const today = todayInBogota();
  const [values, setValues] = useState<FormValues>({
    from: '',
    to: '',
    starts: today,
    ends: today,
    reason: '',
    permissions: [],
  });
  const set = (patch: Partial<FormValues>): void => {
    setValues({ ...values, ...patch });
  };
  const forOther = manageAll && values.from !== '';
  const codes = forOther
    ? APPROVAL_PERMISSIONS
    : APPROVAL_PERMISSIONS.filter((code) => permissions.can(code));
  return { values, set, codes, people: manageAll ? people : null, body: bodyOf(values, manageAll) };
}

/** Delegar aprobaciones por un tiempo (máximo 60 días). */
export function DelegationForm(): JSX.Element {
  const form = useDelegationForm();
  const [done, setDone] = useState(false);
  const create = useCreateDelegation(() => {
    setDone(true);
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setDone(false);
    create.execute(form.body);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Delegar aprobaciones</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          {create.error === null ? null : <FormError error={create.error} />}
          {done && create.error === null ? (
            <FormSuccess message="Registramos la delegación." />
          ) : null}
          <PeopleFields values={form.values} set={form.set} people={form.people} />
          <PeriodFields values={form.values} set={form.set} />
          <ApprovalChoices codes={form.codes} values={form.values} set={form.set} />
          <div>
            <Button type="submit" disabled={create.pending || form.values.permissions.length === 0}>
              {create.pending ? 'Registrando…' : 'Delegar'}
            </Button>
          </div>
          {create.dialog}
        </form>
      </CardContent>
    </Card>
  );
}
