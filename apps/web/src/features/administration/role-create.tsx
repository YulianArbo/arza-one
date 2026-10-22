'use client';

import {
  createdResponseSchema,
  type CreatedResponse,
  type PermissionCatalogResponse,
  type RoleAudience,
} from '@arza/contracts';
import { Button, SelectField } from '@arza/ui';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { useAdminAction } from './admin-action';
import { rolePath } from './labels';
import { PermissionPicker, grantedOf, groupsFor, type PermissionChoice } from './permission-picker';
import { ADMIN_KEYS, usePermissionCatalog } from './queries';
import { QueryState } from './query-state';
import { RoleFields, roleTextBody, type RoleTextValues } from './role-fields';

const AUDIENCES = [
  { value: 'internal', label: 'Personas internas' },
  { value: 'portal', label: 'Usuarios del portal del cliente' },
];

function useCreateRole() {
  const api = useApiClient();
  const router = useRouter();
  return useAdminAction<object, CreatedResponse>({
    run: (body, csrfToken) =>
      api.post('/v1/roles', { body, schema: createdResponseSchema, csrfToken }),
    invalidate: [ADMIN_KEYS.roles],
    onSuccess: (created) => {
      router.push(rolePath(created.id));
    },
  });
}

function AudienceField(props: {
  readonly value: RoleAudience;
  readonly onChange: (audience: RoleAudience) => void;
}): JSX.Element {
  return (
    <SelectField
      id="nuevo-rol-para"
      label="Para quién es"
      options={AUDIENCES}
      value={props.value}
      onChange={(event) => {
        props.onChange(event.target.value === 'portal' ? 'portal' : 'internal');
      }}
    />
  );
}

function NoPermissionsAlert(): JSX.Element {
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      Elija al menos un permiso.
    </p>
  );
}

interface Problems {
  readonly name: string | null;
  readonly permissions: boolean;
}

function problemsOf(text: RoleTextValues, choice: PermissionChoice): Problems {
  const short = text.name.trim().length < 3;
  return {
    name: short ? 'Escriba un nombre de al menos 3 caracteres.' : null,
    permissions: choice.size === 0,
  };
}

function SubmitRow({ pending }: { readonly pending: boolean }): JSX.Element {
  return (
    <div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Creando…' : 'Crear el rol'}
      </Button>
    </div>
  );
}

function CreateForm({ catalog }: { readonly catalog: PermissionCatalogResponse }): JSX.Element {
  const [text, setText] = useState<RoleTextValues>({ name: '', description: '' });
  const [audience, setAudience] = useState<RoleAudience>('internal');
  const [choice, setChoice] = useState<PermissionChoice>(new Map());
  const [problems, setProblems] = useState<Problems | null>(null);
  const create = useCreateRole();
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(text, choice);
    setProblems(found);
    if (found.name !== null || found.permissions) return;
    create.execute({ ...roleTextBody(text), audience, permissions: grantedOf(choice) });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {create.error === null ? null : <FormError error={create.error} />}
      <RoleFields
        idPrefix="nuevo-rol"
        values={text}
        onChange={setText}
        nameError={problems?.name ?? null}
      />
      <AudienceField
        value={audience}
        onChange={(next) => {
          setAudience(next);
          setChoice(new Map());
        }}
      />
      {problems?.permissions === true && choice.size === 0 ? <NoPermissionsAlert /> : null}
      <PermissionPicker
        groups={groupsFor(catalog, audience)}
        choice={choice}
        onChange={setChoice}
      />
      <SubmitRow pending={create.pending} />
      {create.dialog}
    </form>
  );
}

/** Crear un rol personalizado (iam.role.manage). */
export function RoleCreatePanel(): JSX.Element {
  const catalog = usePermissionCatalog();
  return (
    <QueryState query={catalog} loadingLabel="Cargando el catálogo de permisos">
      {(data) => <CreateForm catalog={data} />}
    </QueryState>
  );
}
