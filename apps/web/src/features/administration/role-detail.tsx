'use client';

import {
  roleDetailResponseSchema,
  type PermissionCatalogResponse,
  type RoleDetailResponse,
} from '@arza/contracts';
import { Alert, AlertDescription, Badge, Button } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError, FormSuccess } from '../access/form-alert';
import { PERMISSIONS_QUERY_KEY, usePermissions } from '../session/permissions';
import { useAdminAction } from './admin-action';
import { USER_KIND_LABELS } from './labels';
import { PermissionPicker, choiceOf, grantedOf, groupsFor } from './permission-picker';
import { ADMIN_KEYS, usePermissionCatalog, useRole } from './queries';
import { QueryState } from './query-state';
import { RoleFields, roleTextBody, type RoleTextValues } from './role-fields';

interface RoleProps {
  readonly role: RoleDetailResponse;
  readonly catalog: PermissionCatalogResponse;
}

function useSaveRole(role: RoleDetailResponse, onSaved: () => void) {
  const api = useApiClient();
  return useAdminAction<object, RoleDetailResponse>({
    run: (body, csrfToken) =>
      api.patch(`/v1/roles/${role.id}`, {
        body,
        version: role.version,
        schema: roleDetailResponseSchema,
        csrfToken,
      }),
    invalidate: [ADMIN_KEYS.role(role.id), ADMIN_KEYS.roles, PERMISSIONS_QUERY_KEY],
    onSuccess: onSaved,
  });
}

/** Editar un rol personalizado con la versión que se cargó (numeral 14.1, If-Match). */
function RoleEditor({ role, catalog }: RoleProps): JSX.Element {
  const [text, setText] = useState<RoleTextValues>({
    name: role.name,
    description: role.description ?? '',
  });
  const [choice, setChoice] = useState(() => choiceOf(role.permissions));
  const [saved, setSaved] = useState(false);
  const save = useSaveRole(role, () => {
    setSaved(true);
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSaved(false);
    save.execute({ ...roleTextBody(text), permissions: grantedOf(choice) });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      {saved && save.error === null ? (
        <FormSuccess message="Guardamos los cambios del rol." />
      ) : null}
      <RoleFields idPrefix="rol" values={text} onChange={setText} />
      <PermissionPicker
        groups={groupsFor(catalog, role.audience)}
        choice={choice}
        onChange={setChoice}
      />
      <div>
        <Button type="submit" disabled={save.pending || choice.size === 0}>
          {save.pending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
      {save.dialog}
    </form>
  );
}

function RoleBadges({ role }: { readonly role: RoleDetailResponse }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge tone={role.is_system ? 'info' : 'neutral'}>
        {role.is_system ? 'Rol del sistema' : 'Rol personalizado'}
      </Badge>
      <Badge>{USER_KIND_LABELS[role.audience]}</Badge>
      <Badge>{`${String(role.assigned_users)} personas`}</Badge>
    </div>
  );
}

function RoleView({ role, catalog }: RoleProps): JSX.Element {
  const permissions = usePermissions();
  const editable = !role.is_system && permissions.can('iam.role.manage');
  const groups = groupsFor(catalog, role.audience);
  return (
    <>
      {role.description === null ? (
        <PageHeader title={role.name} />
      ) : (
        <PageHeader title={role.name} description={role.description} />
      )}
      <RoleBadges role={role} />
      {role.is_system ? (
        <Alert tone="info">
          <AlertDescription>
            Los roles del sistema no se editan. Si necesita otra combinación, cree un rol
            personalizado.
          </AlertDescription>
        </Alert>
      ) : null}
      {editable ? (
        <RoleEditor role={role} catalog={catalog} />
      ) : (
        <PermissionPicker groups={groups} choice={choiceOf(role.permissions)} />
      )}
    </>
  );
}

/** Un rol con sus permisos (iam.role.read); los personalizados se editan con iam.role.manage. */
export function RoleDetailPanel({ id }: { readonly id: string }): JSX.Element {
  const role = useRole(id);
  const catalog = usePermissionCatalog();
  return (
    <QueryState query={catalog} loadingLabel="Cargando el catálogo de permisos">
      {(catalogData) => (
        <QueryState query={role} loadingLabel="Cargando el rol">
          {(roleData) => <RoleView key={roleData.version} role={roleData} catalog={catalogData} />}
        </QueryState>
      )}
    </QueryState>
  );
}
