'use client';

import { createdResponseSchema, positionSchema, type Position } from '@arza/contracts';
import { DialogFooter, SelectField, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { CORE_KEYS } from './queries';
import {
  ActiveBadge,
  CheckboxField,
  RecordDialog,
  TextInput,
  idOrNull,
  optionsOf,
} from './record-dialog';
import type { StructureLists } from './units-section';

interface PositionValues {
  readonly name: string;
  readonly unitId: string;
  readonly bossId: string;
  readonly isActive: boolean;
}

function valuesOf(position: Position | null, lists: StructureLists): PositionValues {
  return {
    name: position?.name ?? '',
    unitId: position?.org_unit_id ?? lists.units[0]?.id ?? '',
    bossId: position?.reports_to_id ?? '',
    isActive: position?.is_active ?? true,
  };
}

function useSavePosition(position: Position | null, onSaved: () => void) {
  const api = useApiClient();
  return useAdminAction<PositionValues, unknown>({
    run: (v, csrfToken) => {
      const body = {
        name: v.name.trim(),
        org_unit_id: v.unitId,
        reports_to_id: idOrNull(v.bossId),
      };
      if (position === null) {
        return api.post('/v1/positions', { body, schema: createdResponseSchema, csrfToken });
      }
      const edited = { ...body, is_active: v.isActive };
      const options = {
        body: edited,
        version: position.version,
        schema: positionSchema,
        csrfToken,
      };
      return api.patch(`/v1/positions/${position.id}`, options);
    },
    invalidate: [CORE_KEYS.positions],
    onSuccess: onSaved,
  });
}

function PositionFields(props: {
  readonly values: PositionValues;
  readonly onChange: (values: PositionValues) => void;
  readonly lists: StructureLists;
  readonly selfId: string | null;
}): JSX.Element {
  const { values, onChange, lists } = props;
  const units = lists.units.map((unit) => ({
    value: unit.id,
    label: `${unit.code} · ${unit.name}`,
  }));
  const bosses = lists.positions
    .filter((position) => position.id !== props.selfId)
    .map((position) => ({ id: position.id, label: position.name }));
  return (
    <>
      <SelectField
        id="cargo-proceso"
        label="Proceso o área"
        options={units}
        value={values.unitId}
        onChange={(event) => {
          onChange({ ...values, unitId: event.target.value });
        }}
      />
      <SelectField
        id="cargo-jefe"
        label="Reporta a"
        options={optionsOf(bosses, 'Nadie (cabeza de la empresa)')}
        value={values.bossId}
        onChange={(event) => {
          onChange({ ...values, bossId: event.target.value });
        }}
      />
    </>
  );
}

function PositionName(props: {
  readonly values: PositionValues;
  readonly onChange: (values: PositionValues) => void;
}): JSX.Element {
  const { values, onChange } = props;
  return (
    <TextInput
      id="cargo-nombre"
      label="Nombre del cargo"
      value={values.name}
      onValue={(name) => {
        onChange({ ...values, name });
      }}
    />
  );
}

function PositionForm(props: {
  readonly position: Position | null;
  readonly lists: StructureLists;
  readonly onSaved: () => void;
}): JSX.Element {
  const [values, setValues] = useState(valuesOf(props.position, props.lists));
  const save = useSavePosition(props.position, props.onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute(values);
  };
  const selfId = props.position?.id ?? null;
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <PositionName values={values} onChange={setValues} />
      <PositionFields values={values} onChange={setValues} lists={props.lists} selfId={selfId} />
      {selfId === null ? null : (
        <CheckboxField
          id="cargo-activo"
          label="Activo"
          hint="Un cargo con personas o subordinados no se elimina: se inactiva."
          checked={values.isActive}
          onChange={(isActive) => {
            setValues({ ...values, isActive });
          }}
        />
      )}
      <DialogFooter>
        <SubmitButton label="Guardar" pendingLabel="Guardando…" pending={save.pending} />
      </DialogFooter>
      {save.dialog}
    </form>
  );
}

function useDeletePosition() {
  const api = useApiClient();
  return useAdminAction<Position>({
    run: (position, csrfToken) =>
      api.delete(`/v1/positions/${position.id}`, { version: position.version, csrfToken }),
    invalidate: [CORE_KEYS.positions],
  });
}

interface RowProps {
  readonly position: Position;
  readonly lists: StructureLists;
  readonly onDelete: (position: Position) => void;
}

function PositionActions({ position, lists, onDelete }: RowProps): JSX.Element {
  return (
    <>
      <RecordDialog
        triggerLabel="Editar"
        triggerAriaLabel={`Editar ${position.name}`}
        variant="outline"
        title={`Editar ${position.name}`}
        description="Los cambios quedan en la auditoría."
      >
        {(close) => <PositionForm position={position} lists={lists} onSaved={close} />}
      </RecordDialog>
      <ConfirmActionButton
        size="sm"
        label="Eliminar"
        title={`¿Eliminar el cargo ${position.name}?`}
        description="Solo se puede si nadie lo tiene, nadie le reporta y no lidera procesos. Si no, inactívelo."
        confirmLabel="Sí, eliminar"
        disabled={false}
        onConfirm={() => {
          onDelete(position);
        }}
      />
    </>
  );
}

function PositionRow(props: RowProps & { readonly canManage: boolean }): JSX.Element {
  const { position, lists } = props;
  const unit = lists.units.find((u) => u.id === position.org_unit_id);
  const boss = lists.positions.find((p) => p.id === position.reports_to_id);
  return (
    <TableRow>
      <TableCell className="font-medium">{position.name}</TableCell>
      <TableCell>{unit === undefined ? '—' : `${unit.code} · ${unit.name}`}</TableCell>
      <TableCell>{boss?.name ?? '—'}</TableCell>
      <TableCell>
        <ActiveBadge active={position.is_active} />
      </TableCell>
      <TableCell className="flex gap-2">
        {props.canManage ? <PositionActions {...props} /> : null}
      </TableCell>
    </TableRow>
  );
}

/** Cargos del organigrama y a quién reporta cada uno. */
export function PositionsSection(props: {
  readonly lists: StructureLists;
  readonly canManage: boolean;
}): JSX.Element {
  const remove = useDeletePosition();
  return (
    <section aria-labelledby="cargos-titulo" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="cargos-titulo" className="text-lg font-semibold">
          Cargos
        </h2>
        {props.canManage && props.lists.units.length > 0 ? (
          <RecordDialog
            triggerLabel="Agregar un cargo"
            title="Agregar un cargo"
            description="Cada cargo pertenece a un proceso o área y reporta a otro cargo."
          >
            {(close) => <PositionForm position={null} lists={props.lists} onSaved={close} />}
          </RecordDialog>
        ) : null}
      </div>
      {remove.error === null ? null : <FormError error={remove.error} />}
      <SimpleTable headers={['Cargo', 'Proceso o área', 'Reporta a', 'Estado', '']}>
        {props.lists.positions.map((position) => (
          <PositionRow
            key={position.id}
            position={position}
            lists={props.lists}
            canManage={props.canManage}
            onDelete={remove.execute}
          />
        ))}
      </SimpleTable>
    </section>
  );
}
