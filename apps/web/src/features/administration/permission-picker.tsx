'use client';

import {
  isPermissionCode,
  type GrantedPermission,
  type PermissionCatalogResponse,
  type PermissionScope,
  type RoleAudience,
} from '@arza/contracts';
import type { JSX } from 'react';

type Group = PermissionCatalogResponse['groups'][number];
type CatalogPermission = Group['permissions'][number];

/** Permisos elegidos, por código. */
export type PermissionChoice = ReadonlyMap<string, PermissionScope>;

export function choiceOf(permissions: readonly GrantedPermission[]): PermissionChoice {
  return new Map(permissions.map((item) => [item.code, item.scope]));
}

export function grantedOf(choice: PermissionChoice): GrantedPermission[] {
  return [...choice.entries()].flatMap(([code, scope]) =>
    isPermissionCode(code) ? [{ code, scope }] : [],
  );
}

/** Los grupos del catálogo que caben en el rol: el portal para el portal y los demás para el resto. */
export function groupsFor(catalog: PermissionCatalogResponse, audience: RoleAudience): Group[] {
  return catalog.groups.filter((group) => (group.key === 'portal') === (audience === 'portal'));
}

interface PickerProps {
  readonly groups: readonly Group[];
  readonly choice: PermissionChoice;
  /** Sin onChange, solo se muestra. */
  readonly onChange?: (choice: PermissionChoice) => void;
}

function PermissionRow(props: {
  readonly permission: CatalogPermission;
  readonly scope: PermissionScope | undefined;
  readonly onChange: ((scope: PermissionScope | null) => void) | undefined;
}): JSX.Element {
  const { permission, scope, onChange } = props;
  const id = `permiso-${permission.code}`;
  const readOnly = onChange === undefined;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-1.5">
      <label htmlFor={id} className="flex items-start gap-2 text-sm">
        <input
          id={id}
          type="checkbox"
          checked={scope !== undefined}
          disabled={readOnly}
          onChange={(event) => onChange?.(event.target.checked ? 'all' : null)}
        />
        <span>
          {permission.description}
          <span className="block text-xs text-muted-foreground">{permission.code}</span>
        </span>
      </label>
      {scope !== undefined && permission.ownable ? (
        <select
          aria-label={`Alcance de «${permission.description}»`}
          className="h-8 rounded-md border border-input bg-card px-2 text-xs"
          value={scope}
          disabled={readOnly}
          onChange={(event) => onChange?.(event.target.value === 'own' ? 'own' : 'all')}
        >
          <option value="all">Todo</option>
          <option value="own">Solo lo propio</option>
        </select>
      ) : null}
    </li>
  );
}

interface GroupProps {
  readonly group: Group;
  readonly choice: PermissionChoice;
  readonly onUpdate: ((code: string, scope: PermissionScope | null) => void) | undefined;
}

/** Un módulo del catálogo. Solo para ver, muestra únicamente los permisos que el rol tiene. */
function GroupSection({ group, choice, onUpdate }: GroupProps): JSX.Element | null {
  const chosen = group.permissions.filter((item) => choice.has(item.code));
  const visible = onUpdate === undefined ? chosen : group.permissions;
  if (visible.length === 0) return null;
  return (
    <details className="rounded-lg border bg-card px-4 py-2" open={onUpdate === undefined}>
      <summary className="cursor-pointer py-1 font-medium">
        {group.label} ({group.module}) · {chosen.length} de {group.permissions.length}
      </summary>
      <ul className="divide-y">
        {visible.map((permission) => (
          <PermissionRow
            key={permission.code}
            permission={permission}
            scope={choice.get(permission.code)}
            onChange={
              onUpdate === undefined
                ? undefined
                : (scope) => {
                    onUpdate(permission.code, scope);
                  }
            }
          />
        ))}
      </ul>
    </details>
  );
}

/** Permisos del anexo G por módulo, con «todo» o «solo lo propio» donde se puede limitar. */
export function PermissionPicker({ groups, choice, onChange }: PickerProps): JSX.Element {
  const update = (code: string, scope: PermissionScope | null): void => {
    if (onChange === undefined) return;
    const next = new Map(choice);
    if (scope === null) next.delete(code);
    else next.set(code, scope);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <GroupSection
          key={group.key}
          group={group}
          choice={choice}
          onUpdate={onChange === undefined ? undefined : update}
        />
      ))}
    </div>
  );
}
