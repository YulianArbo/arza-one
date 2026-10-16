'use client';

import type { UpdateUserRequest, UserDetailResponse, UserPosition } from '@arza/contracts';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError, FormSuccess } from '../access/form-alert';
import { usePositions } from '../organization/queries';
import { useAdminAction } from './admin-action';
import { personName } from './labels';
import { ADMIN_KEYS } from './queries';
import { SelectField } from './select-field';

const NO_POSITION = '';

function positionLabel(position: UserPosition | null): string {
  if (position === null) return 'Sin cargo';
  return position.is_active ? position.name : `${position.name} (cargo inactivo)`;
}

function useSavePosition(user: UserDetailResponse, onSaved: () => void) {
  const api = useApiClient();
  return useAdminAction<UpdateUserRequest>({
    run: (body, csrfToken) =>
      api.patch(`/v1/users/${user.id}`, { body, version: user.version, csrfToken }),
    invalidate: [ADMIN_KEYS.user(user.id), ADMIN_KEYS.users],
    onSuccess: onSaved,
    reason: 'Esta acción cambia quién aprueba las solicitudes de otra persona.',
  });
}

/** Cargos activos para elegir, más el actual aunque ya esté inactivo, y «Sin cargo». */
function usePositionOptions(current: UserPosition | null): { value: string; label: string }[] {
  const positions = usePositions();
  const active = (positions.data?.data ?? [])
    .filter((position) => position.is_active && position.id !== current?.id)
    .map((position) => ({ value: position.id, label: position.name }));
  const kept = current === null ? [] : [{ value: current.id, label: positionLabel(current) }];
  const choices = [...kept, ...active].sort((a, b) => a.label.localeCompare(b.label, 'es'));
  return [{ value: NO_POSITION, label: 'Sin cargo' }, ...choices];
}

interface PositionFormProps {
  readonly user: UserDetailResponse;
  readonly onSave: (body: UpdateUserRequest) => void;
  readonly pending: boolean;
}

function PositionForm({ user, onSave, pending }: PositionFormProps): JSX.Element {
  const options = usePositionOptions(user.position);
  const saved = user.position?.id ?? NO_POSITION;
  const [positionId, setPositionId] = useState(saved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSave({ position_id: positionId === NO_POSITION ? null : positionId });
  };
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <SelectField
        id="cargo-usuario"
        label="Cargo"
        hint="Solo aparecen los cargos activos del organigrama."
        options={options}
        value={positionId}
        onChange={(event) => {
          setPositionId(event.target.value);
        }}
      />
      <Button type="submit" disabled={pending || positionId === saved}>
        {pending ? 'Guardando…' : 'Guardar el cargo'}
      </Button>
    </form>
  );
}

interface PositionCardProps {
  readonly user: UserDetailResponse;
  /** Puede cambiar el cargo (iam.user.update y ver el organigrama) y la ficha no es la suya. */
  readonly canEdit: boolean;
}

/**
 * Cargo de la persona en el organigrama. De él sale su jefe inmediato para las aprobaciones y
 * los escalamientos de los flujos (B15).
 */
export function UserPositionCard({ user, canEdit }: PositionCardProps): JSX.Element {
  const [saved, setSaved] = useState(false);
  const save = useSavePosition(user, () => {
    setSaved(true);
  });
  const execute = (body: UpdateUserRequest): void => {
    setSaved(false);
    save.execute(body);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cargo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p>
          <span className="text-muted-foreground">Cargo actual: </span>
          {positionLabel(user.position)}
        </p>
        <p className="text-xs text-muted-foreground">
          Del cargo sale el jefe inmediato que aprueba las solicitudes de {personName(user)}.
        </p>
        {save.error === null ? null : <FormError error={save.error} />}
        {saved ? <FormSuccess message="Guardamos el cargo." /> : null}
        {canEdit ? (
          <PositionForm key={user.version} user={user} onSave={execute} pending={save.pending} />
        ) : null}
        {save.dialog}
      </CardContent>
    </Card>
  );
}
