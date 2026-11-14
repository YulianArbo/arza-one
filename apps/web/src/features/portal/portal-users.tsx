'use client';

import {
  PORTAL_ROLE_LABELS,
  PORTAL_USER_STATUSES,
  createdResponseSchema,
  type PortalUser,
  type PortalUserList,
} from '@arza/contracts';
import { Badge, Button, Card, CardContent, Checkbox } from '@arza/ui';
import { useState, type JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import {
  ChoiceFields,
  DialogForm,
  Fields,
  optionsOf,
  summaryOf,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from '../projects/form-bits';
import { Fact } from './portal-bits';
import { usePortalAction, usePortalUsers } from './portal-queries';

// Usuarios de mi empresa (B30, ficha 17.10): el administrador del cliente invita a las personas de
// su empresa, las cambia entre administrador y usuario, las desactiva y decide qué proyectos ve
// cada usuario. No puede cambiar su propia cuenta. La API revisa todo de nuevo.

type InviteKey = 'email' | 'name' | 'role';

const INVITE_TEXTS: readonly FieldSpec<InviteKey>[] = [
  { key: 'name', field: 'display_name', id: 'invitar-nombre', label: 'Nombre' },
  { key: 'email', field: 'email', id: 'invitar-correo', label: 'Correo' },
];

const INVITE_CHOICES: readonly ChoiceSpec<InviteKey>[] = [
  {
    key: 'role',
    field: 'role',
    id: 'invitar-rol',
    label: 'Rol',
    hint: 'El administrador ve todo lo de su empresa y debe usar segundo factor. El usuario ve los proyectos que usted le asigne.',
    options: optionsOf(PORTAL_ROLE_LABELS),
  },
];

function inviteProblems(values: Readonly<Record<InviteKey, string>>): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.name.trim().length < 3) found['display_name'] = 'Escriba el nombre de la persona.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.email.trim()))
    found['email'] = 'Revise el correo.';
  return found;
}

/** Envía la invitación y cierra el diálogo. */
function useInviteForm(close: () => void) {
  const api = useApiClient();
  const invite = usePortalAction<object, string>(
    async (body, csrfToken) =>
      (await api.post('/v1/portal/users', { body, schema: createdResponseSchema, csrfToken })).id,
    close,
  );
  const form = useDialogForm(
    { email: '', name: '', role: 'CLIENTE_USUARIO' },
    inviteProblems,
    (values) => {
      invite.execute({
        email: values.email.trim().toLowerCase(),
        display_name: values.name.trim(),
        role: values.role,
      });
    },
  );
  return { invite, form };
}

function InviteForm({ close }: { readonly close: () => void }): JSX.Element {
  const { invite, form } = useInviteForm(close);
  const change = (key: InviteKey, value: string): void => {
    form.set({ [key]: value });
  };
  return (
    <DialogForm
      problems={form.problems}
      fields={[...summaryOf(INVITE_TEXTS), ...summaryOf(INVITE_CHOICES)]}
      action={invite}
      submitLabel="Enviar invitación"
      onSubmit={form.submit}
    >
      <Fields
        specs={INVITE_TEXTS}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
      <ChoiceFields
        specs={INVITE_CHOICES}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
    </DialogForm>
  );
}

interface Change {
  readonly user: PortalUser;
  readonly body: object;
  readonly path: string;
  readonly versioned: boolean;
}

/** Cambiar el rol, activar o desactivar, y los proyectos de un usuario. */
function useUserChange() {
  const api = useApiClient();
  return usePortalAction<Change>(async (change, csrfToken) => {
    await api.put(change.path, {
      body: change.body,
      csrfToken,
      ...(change.versioned ? { version: change.user.version } : {}),
    });
  });
}

function ProjectChecks(props: {
  readonly user: PortalUser;
  readonly list: PortalUserList;
  readonly ids: readonly string[];
  readonly toggle: (id: string, on: boolean) => void;
}): JSX.Element {
  return (
    <>
      {props.list.projects.map((project) => (
        <div key={project.id} className="flex items-center gap-2">
          <Checkbox
            id={`proyecto-${props.user.id}-${project.id}`}
            checked={props.ids.includes(project.id)}
            onChange={(event) => {
              props.toggle(project.id, event.target.checked);
            }}
          />
          <label htmlFor={`proyecto-${props.user.id}-${project.id}`} className="text-sm">
            {project.name} <span className="text-muted-foreground">· {project.code}</span>
          </label>
        </div>
      ))}
    </>
  );
}

function ProjectAccess(props: { readonly user: PortalUser; readonly list: PortalUserList }) {
  const change = useUserChange();
  const [ids, setIds] = useState<readonly string[]>(props.user.project_ids);
  const toggle = (id: string, on: boolean): void => {
    setIds(on ? [...ids, id] : ids.filter((item) => item !== id));
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Proyectos que ve</legend>
      <ProjectChecks user={props.user} list={props.list} ids={ids} toggle={toggle} />
      {change.error === null ? null : <FormError error={change.error} />}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={change.pending}
          onClick={() => {
            change.execute({
              user: props.user,
              body: { project_ids: ids },
              path: `/v1/portal/users/${props.user.id}/projects`,
              versioned: false,
            });
          }}
        >
          {change.pending ? 'Guardando…' : 'Guardar proyectos'}
        </Button>
      </div>
      {change.dialog}
    </fieldset>
  );
}

function UserActions({ user }: { readonly user: PortalUser }): JSX.Element {
  const change = useUserChange();
  const active = user.status !== 'inactive';
  const other = user.role === 'CLIENTE_ADMIN' ? 'CLIENTE_USUARIO' : 'CLIENTE_ADMIN';
  const run = (body: object): void => {
    change.execute({ user, body, path: `/v1/portal/users/${user.id}`, versioned: true });
  };
  return (
    <div className="flex flex-col gap-2">
      {change.error === null ? null : <FormError error={change.error} />}
      <div className="flex flex-wrap gap-2">
        {active ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={change.pending}
            onClick={() => {
              run({ role: other, active: true });
            }}
          >
            Cambiar a {PORTAL_ROLE_LABELS[other].toLowerCase()}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={change.pending}
          onClick={() => {
            run({ role: user.role, active: !active });
          }}
        >
          {active ? 'Desactivar' : 'Activar'}
        </Button>
      </div>
      {change.dialog}
    </div>
  );
}

function UserCard(props: { readonly user: PortalUser; readonly list: PortalUserList }) {
  const { user } = props;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-heading font-semibold">
            {user.name} {user.is_me ? <span className="text-sm font-normal">(usted)</span> : null}
            <span className="block text-sm font-normal break-all text-muted-foreground">
              {user.email}
            </span>
          </h3>
          <Badge tone={user.status === 'active' ? 'success' : 'neutral'}>
            {PORTAL_USER_STATUSES[user.status]}
          </Badge>
        </div>
        <Fact label="Rol">{PORTAL_ROLE_LABELS[user.role]}</Fact>
        <Fact label="Último ingreso">
          {user.last_login_at === null ? 'Nunca' : formatDateTime(user.last_login_at)}
        </Fact>
        {user.is_me ? null : <UserActions user={user} />}
        {user.is_me || user.role === 'CLIENTE_ADMIN' ? null : (
          <ProjectAccess user={user} list={props.list} />
        )}
      </CardContent>
    </Card>
  );
}

export function PortalUsersPage(): JSX.Element {
  const users = usePortalUsers();
  return (
    <>
      <PageHeader
        title="Usuarios de mi empresa"
        description="Las personas de su empresa en el portal."
        action={
          <RecordDialog
            triggerLabel="Invitar a una persona"
            title="Invitar a una persona"
            description="Le llegará un enlace de un solo uso que vence en 72 horas."
          >
            {(close) => <InviteForm close={close} />}
          </RecordDialog>
        }
      />
      <QueryState query={users} loadingLabel="Cargando los usuarios">
        {(data) => (
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Usuarios">
            {data.data.map((user) => (
              <li key={user.id}>
                <UserCard user={user} list={data} />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </>
  );
}
