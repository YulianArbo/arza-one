'use client';

import { createdResponseSchema, orgUnitSchema, type OrgUnit, type Position } from '@arza/contracts';
import { DialogFooter, FormField, SelectField, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { CORE_KEYS } from './queries';
import { ActiveBadge, CheckboxField, RecordDialog, idOrNull, optionsOf } from './record-dialog';

const KIND_OPTIONS = [
  { value: 'process', label: 'Proceso' },
  { value: 'area', label: 'Área' },
];

export interface StructureLists {
  readonly units: readonly OrgUnit[];
  readonly positions: readonly Position[];
}

interface UnitValues {
  readonly code: string;
  readonly name: string;
  readonly kind: 'process' | 'area';
  readonly parentId: string;
  readonly ownerId: string;
  readonly isActive: boolean;
}

interface FieldsProps {
  readonly values: UnitValues;
  readonly onChange: (values: UnitValues) => void;
}

function valuesOf(unit: OrgUnit | null): UnitValues {
  return {
    code: unit?.code ?? '',
    name: unit?.name ?? '',
    kind: unit?.kind ?? 'process',
    parentId: unit?.parent_id ?? '',
    ownerId: unit?.owner_position_id ?? '',
    isActive: unit?.is_active ?? true,
  };
}

function useSaveUnit(unit: OrgUnit | null, onSaved: () => void) {
  const api = useApiClient();
  return useAdminAction<UnitValues, unknown>({
    run: (v, csrfToken) => {
      const body = {
        code: v.code.trim().toUpperCase(),
        name: v.name.trim(),
        kind: v.kind,
        parent_id: idOrNull(v.parentId),
        owner_position_id: idOrNull(v.ownerId),
      };
      if (unit === null) {
        return api.post('/v1/org-units', { body, schema: createdResponseSchema, csrfToken });
      }
      const edited = { ...body, is_active: v.isActive };
      const options = { body: edited, version: unit.version, schema: orgUnitSchema, csrfToken };
      return api.patch(`/v1/org-units/${unit.id}`, options);
    },
    invalidate: [CORE_KEYS.units],
    onSuccess: onSaved,
  });
}

function IdentityFields({ values, onChange }: FieldsProps): JSX.Element {
  return (
    <>
      <FormField
        id="proceso-codigo"
        label="Código"
        hint="Por ejemplo COM. Mayúsculas, números y guiones."
        value={values.code}
        onChange={(event) => {
          onChange({ ...values, code: event.target.value });
        }}
      />
      <FormField
        id="proceso-nombre"
        label="Nombre"
        value={values.name}
        onChange={(event) => {
          onChange({ ...values, name: event.target.value });
        }}
      />
      <SelectField
        id="proceso-tipo"
        label="Tipo"
        options={KIND_OPTIONS}
        value={values.kind}
        onChange={(event) => {
          onChange({ ...values, kind: event.target.value === 'area' ? 'area' : 'process' });
        }}
      />
    </>
  );
}

function LinkFields(
  props: FieldsProps & { readonly lists: StructureLists; readonly selfId: string | null },
) {
  const { values, onChange, lists } = props;
  const parents = lists.units
    .filter((unit) => unit.id !== props.selfId)
    .map((unit) => ({ id: unit.id, label: `${unit.code} · ${unit.name}` }));
  const owners = lists.positions.map((position) => ({ id: position.id, label: position.name }));
  return (
    <>
      <SelectField
        id="proceso-padre"
        label="Depende de"
        options={optionsOf(parents, 'Ninguno (nivel superior)')}
        value={values.parentId}
        onChange={(event) => {
          onChange({ ...values, parentId: event.target.value });
        }}
      />
      <SelectField
        id="proceso-lider"
        label="Cargo líder"
        options={optionsOf(owners, 'Sin asignar')}
        value={values.ownerId}
        onChange={(event) => {
          onChange({ ...values, ownerId: event.target.value });
        }}
      />
    </>
  );
}

function UnitForm(props: {
  readonly unit: OrgUnit | null;
  readonly lists: StructureLists;
  readonly onSaved: () => void;
}): JSX.Element {
  const [values, setValues] = useState(valuesOf(props.unit));
  const save = useSaveUnit(props.unit, props.onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute(values);
  };
  const selfId = props.unit?.id ?? null;
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <IdentityFields values={values} onChange={setValues} />
      <LinkFields values={values} onChange={setValues} lists={props.lists} selfId={selfId} />
      {selfId === null ? null : (
        <CheckboxField
          id="proceso-activo"
          label="Activo"
          hint="Un proceso con registros no se elimina: se inactiva."
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

function useDeleteUnit() {
  const api = useApiClient();
  return useAdminAction<OrgUnit>({
    run: (unit, csrfToken) =>
      api.delete(`/v1/org-units/${unit.id}`, { version: unit.version, csrfToken }),
    invalidate: [CORE_KEYS.units],
  });
}

interface RowProps {
  readonly unit: OrgUnit;
  readonly lists: StructureLists;
  readonly onDelete: (unit: OrgUnit) => void;
}

function UnitActions({ unit, lists, onDelete }: RowProps): JSX.Element {
  return (
    <>
      <RecordDialog
        triggerLabel="Editar"
        triggerAriaLabel={`Editar ${unit.name}`}
        variant="outline"
        title={`Editar ${unit.name}`}
        description="Los cambios quedan en la auditoría."
      >
        {(close) => <UnitForm unit={unit} lists={lists} onSaved={close} />}
      </RecordDialog>
      <ConfirmActionButton
        label="Eliminar"
        title={`¿Eliminar ${unit.name}?`}
        description="Solo se puede si no tiene áreas, cargos ni centros de costo. Si los tiene, inactívelo."
        confirmLabel="Sí, eliminar"
        disabled={false}
        onConfirm={() => {
          onDelete(unit);
        }}
      />
    </>
  );
}

function UnitRow(props: RowProps & { readonly canManage: boolean }): JSX.Element {
  const { unit, lists } = props;
  const parent = lists.units.find((u) => u.id === unit.parent_id);
  const owner = lists.positions.find((p) => p.id === unit.owner_position_id);
  return (
    <TableRow>
      <TableCell className="font-medium">{unit.code}</TableCell>
      <TableCell>{unit.name}</TableCell>
      <TableCell>{unit.kind === 'area' ? 'Área' : 'Proceso'}</TableCell>
      <TableCell>{parent?.name ?? '—'}</TableCell>
      <TableCell>{owner?.name ?? '—'}</TableCell>
      <TableCell>
        <ActiveBadge active={unit.is_active} />
      </TableCell>
      <TableCell className="flex gap-2">
        {props.canManage ? <UnitActions {...props} /> : null}
      </TableCell>
    </TableRow>
  );
}

/** Procesos y áreas del mapa de procesos (MP-DG-001). */
export function UnitsSection(props: {
  readonly lists: StructureLists;
  readonly canManage: boolean;
}): JSX.Element {
  const remove = useDeleteUnit();
  return (
    <section aria-labelledby="procesos-titulo" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="procesos-titulo" className="text-lg font-semibold">
          Procesos y áreas
        </h2>
        {props.canManage ? (
          <RecordDialog
            triggerLabel="Agregar un proceso o área"
            title="Agregar un proceso o área"
            description="Puede depender de otro proceso y tener un cargo líder."
          >
            {(close) => <UnitForm unit={null} lists={props.lists} onSaved={close} />}
          </RecordDialog>
        ) : null}
      </div>
      {remove.error === null ? null : <FormError error={remove.error} />}
      <SimpleTable headers={['Código', 'Nombre', 'Tipo', 'Depende de', 'Líder', 'Estado', '']}>
        {props.lists.units.map((unit) => (
          <UnitRow
            key={unit.id}
            unit={unit}
            lists={props.lists}
            canManage={props.canManage}
            onDelete={remove.execute}
          />
        ))}
      </SimpleTable>
    </section>
  );
}
