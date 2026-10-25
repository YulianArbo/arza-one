'use client';

import { inviteUserResponseSchema, type RoleSummary, type UserKind } from '@arza/contracts';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormField,
  SelectField,
} from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError, FormSuccess } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from './admin-action';
import { ClientCompanyPicker } from './client-company-picker';
import { ADMIN_KEYS, useRoles } from './queries';

interface InviteValues {
  readonly email: string;
  readonly name: string;
  readonly kind: UserKind;
  readonly roleIds: readonly string[];
  /** Empresa cliente de la persona del portal (B22A). */
  readonly partyId: string;
}

const EMPTY: InviteValues = { email: '', name: '', kind: 'internal', roleIds: [], partyId: '' };

/**
 * Roles que no se eligen al invitar: COLABORADOR llega solo a toda persona interna, y AUDITOR
 * exige fecha de vencimiento, que se pone al asignarlo desde la ficha.
 */
const NOT_AT_INVITATION: ReadonlySet<string> = new Set(['COLABORADOR', 'AUDITOR']);

const KIND_OPTIONS = [
  { value: 'internal', label: 'Persona interna' },
  { value: 'portal', label: 'Usuario del portal del cliente' },
];

function RoleChoices(props: {
  readonly roles: readonly RoleSummary[];
  readonly chosen: readonly string[];
  readonly onChange: (ids: string[]) => void;
}): JSX.Element {
  const toggle = (id: string): void => {
    const { chosen } = props;
    props.onChange(chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id]);
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Roles adicionales (opcional)</legend>
      <p className="text-xs text-muted-foreground">
        El rol de auditor se asigna desde la ficha, porque necesita fecha de vencimiento.
      </p>
      <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
        {props.roles.map((role) => (
          <label key={role.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={props.chosen.includes(role.id)}
              onChange={() => {
                toggle(role.id);
              }}
            />
            {role.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PersonFields(props: {
  readonly values: InviteValues;
  readonly onChange: (values: InviteValues) => void;
}): JSX.Element {
  const { values, onChange } = props;
  return (
    <>
      <FormField
        id="invitar-correo"
        label="Correo"
        type="email"
        autoComplete="off"
        value={values.email}
        onChange={(event) => {
          onChange({ ...values, email: event.target.value });
        }}
      />
      <FormField
        id="invitar-nombre"
        label="Nombre (opcional)"
        value={values.name}
        onChange={(event) => {
          onChange({ ...values, name: event.target.value });
        }}
      />
      <SelectField
        id="invitar-tipo"
        label="Tipo de usuario"
        hint={values.kind === 'internal' ? 'Recibe además el rol Colaborador.' : undefined}
        options={KIND_OPTIONS}
        value={values.kind}
        onChange={(event) => {
          const kind = event.target.value === 'portal' ? 'portal' : 'internal';
          onChange({ ...values, kind, roleIds: [], partyId: '' });
        }}
      />
    </>
  );
}

function useInvite(onInvited: (email: string) => void) {
  const api = useApiClient();
  return useAdminAction<InviteValues, unknown>({
    run: (values, csrfToken) => {
      const name = values.name.trim();
      const body = {
        email: values.email,
        display_name: name === '' ? null : name,
        kind: values.kind,
        role_ids: values.roleIds,
        party_id: values.kind === 'portal' && values.partyId !== '' ? values.partyId : null,
      };
      return api.post('/v1/users', { body, schema: inviteUserResponseSchema, csrfToken });
    },
    invalidate: [ADMIN_KEYS.users],
    onSuccess: (_result, values) => {
      onInvited(values.email);
    },
  });
}

/** Valores, roles disponibles y envío; la persona del portal necesita su empresa cliente. */
function useInviteForm(onInvited: (email: string) => void) {
  const [values, setValues] = useState<InviteValues>(EMPTY);
  const roles = useRoles();
  const invite = useInvite(onInvited);
  const available = (roles.data?.data ?? []).filter(
    (role) => role.audience === values.kind && !NOT_AT_INVITATION.has(role.code),
  );
  const [missingCompany, setMissingCompany] = useState(false);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const missing = values.kind === 'portal' && values.partyId === '';
    setMissingCompany(missing);
    if (!missing) invite.execute(values);
  };
  return { values, setValues, invite, available, missingCompany, submit };
}

function InviteForm({ onInvited }: { readonly onInvited: (email: string) => void }): JSX.Element {
  const { values, setValues, invite, available, missingCompany, submit } = useInviteForm(onInvited);
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {invite.error === null ? null : <FormError error={invite.error} />}
      <PersonFields values={values} onChange={setValues} />
      {values.kind === 'portal' ? (
        <ClientCompanyPicker
          value={values.partyId}
          error={missingCompany ? 'Elija la empresa cliente de esta persona.' : null}
          onChange={(partyId) => {
            setValues({ ...values, partyId });
          }}
        />
      ) : null}
      <RoleChoices
        roles={available}
        chosen={values.roleIds}
        onChange={(roleIds) => {
          setValues({ ...values, roleIds });
        }}
      />
      <DialogFooter>
        <SubmitButton label="Enviar invitación" pendingLabel="Enviando…" pending={invite.pending} />
      </DialogFooter>
      {invite.dialog}
    </form>
  );
}

/** Invitar a una persona (iam.user.invite): el enlace llega por correo y vence en 72 horas. */
export function InviteUserDialog(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [invited, setInvited] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button">Invitar a una persona</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar a una persona</DialogTitle>
            <DialogDescription>
              Le llegará un correo con un enlace de un solo uso que vence en 72 horas.
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <InviteForm
              onInvited={(email) => {
                setInvited(email);
                setOpen(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {invited === null ? null : <FormSuccess message={`Enviamos la invitación a ${invited}.`} />}
    </div>
  );
}
