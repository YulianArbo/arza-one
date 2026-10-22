'use client';

import {
  costCenterSchema,
  createdResponseSchema,
  type CostCenter,
  type OrgUnit,
} from '@arza/contracts';
import {
  DialogFooter,
  EmptyState,
  FormField,
  SelectField,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { Landmark } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { CORE_KEYS, useCostCenters, useOrgUnits } from './queries';
import { ActiveBadge, CheckboxField, RecordDialog, idOrNull, optionsOf } from './record-dialog';

interface CenterValues {
  readonly code: string;
  readonly name: string;
  readonly unitId: string;
  readonly isActive: boolean;
}

function useSaveCenter(center: CostCenter | null, onSaved: () => void) {
  const api = useApiClient();
  return useAdminAction<CenterValues, unknown>({
    run: (v, csrfToken) => {
      const body = {
        code: v.code.trim().toUpperCase(),
        name: v.name.trim(),
        org_unit_id: idOrNull(v.unitId),
      };
      if (center === null) {
        return api.post('/v1/cost-centers', { body, schema: createdResponseSchema, csrfToken });
      }
      const edited = { ...body, is_active: v.isActive };
      const options = {
        body: edited,
        version: center.version,
        schema: costCenterSchema,
        csrfToken,
      };
      return api.patch(`/v1/cost-centers/${center.id}`, options);
    },
    invalidate: [CORE_KEYS.costCenters],
    onSuccess: onSaved,
  });
}

function CenterFields(props: {
  readonly values: CenterValues;
  readonly onChange: (values: CenterValues) => void;
  readonly units: readonly OrgUnit[];
}): JSX.Element {
  const { values, onChange } = props;
  const units = props.units.map((unit) => ({ id: unit.id, label: `${unit.code} · ${unit.name}` }));
  return (
    <>
      <FormField
        id="centro-codigo"
        label="Código"
        hint="Por ejemplo CC-010."
        value={values.code}
        onChange={(event) => {
          onChange({ ...values, code: event.target.value });
        }}
      />
      <FormField
        id="centro-nombre"
        label="Nombre"
        value={values.name}
        onChange={(event) => {
          onChange({ ...values, name: event.target.value });
        }}
      />
      <SelectField
        id="centro-proceso"
        label="Proceso o área (opcional)"
        options={optionsOf(units, 'Ninguno')}
        value={values.unitId}
        onChange={(event) => {
          onChange({ ...values, unitId: event.target.value });
        }}
      />
    </>
  );
}

function CenterForm(props: {
  readonly center: CostCenter | null;
  readonly units: readonly OrgUnit[];
  readonly onSaved: () => void;
}): JSX.Element {
  const { center } = props;
  const [values, setValues] = useState<CenterValues>({
    code: center?.code ?? '',
    name: center?.name ?? '',
    unitId: center?.org_unit_id ?? '',
    isActive: center?.is_active ?? true,
  });
  const save = useSaveCenter(center, props.onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute(values);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <CenterFields values={values} onChange={setValues} units={props.units} />
      {center === null ? null : (
        <CheckboxField
          id="centro-activo"
          label="Activo"
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

function useDeleteCenter() {
  const api = useApiClient();
  return useAdminAction<CostCenter>({
    run: (center, csrfToken) =>
      api.delete(`/v1/cost-centers/${center.id}`, { version: center.version, csrfToken }),
    invalidate: [CORE_KEYS.costCenters],
  });
}

interface RowProps {
  readonly center: CostCenter;
  readonly units: readonly OrgUnit[];
  readonly canManage: boolean;
  readonly onDelete: (center: CostCenter) => void;
}

function CenterRow({ center, units, canManage, onDelete }: RowProps): JSX.Element {
  const unit = units.find((u) => u.id === center.org_unit_id);
  return (
    <TableRow>
      <TableCell className="font-medium">{center.code}</TableCell>
      <TableCell>{center.name}</TableCell>
      <TableCell>{unit?.name ?? '—'}</TableCell>
      <TableCell>
        <ActiveBadge active={center.is_active} />
      </TableCell>
      <TableCell className="flex gap-2">
        {canManage ? (
          <>
            <RecordDialog
              triggerLabel="Editar"
              triggerAriaLabel={`Editar ${center.name}`}
              variant="outline"
              title={`Editar ${center.name}`}
              description="Los cambios quedan en la auditoría."
            >
              {(close) => <CenterForm center={center} units={units} onSaved={close} />}
            </RecordDialog>
            <ConfirmActionButton
              label="Eliminar"
              title={`¿Eliminar el centro de costo ${center.name}?`}
              description="Dejará de aparecer en las listas. Queda en la auditoría."
              confirmLabel="Sí, eliminar"
              disabled={false}
              onConfirm={() => {
                onDelete(center);
              }}
            />
          </>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function CenterTable(
  props: Omit<RowProps, 'center'> & { readonly centers: readonly CostCenter[] },
) {
  if (props.centers.length === 0) {
    return (
      <EmptyState
        icon={<Landmark />}
        title="Todavía no hay centros de costo"
        description="Agregue los centros de costo con que la empresa reparte sus gastos."
      />
    );
  }
  return (
    <SimpleTable headers={['Código', 'Nombre', 'Proceso o área', 'Estado', '']}>
      {props.centers.map((center) => (
        <CenterRow key={center.id} {...props} center={center} />
      ))}
    </SimpleTable>
  );
}

/** Centros de costo de la empresa (ficha 17.1). */
export function CostCentersPanel(): JSX.Element {
  const centers = useCostCenters();
  const units = useOrgUnits().data?.data ?? [];
  const canManage = usePermissions().can('core.org.manage');
  const remove = useDeleteCenter();
  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div>
          <RecordDialog
            triggerLabel="Agregar un centro de costo"
            title="Agregar un centro de costo"
            description="El código no se repite, aunque el centro se elimine."
          >
            {(close) => <CenterForm center={null} units={units} onSaved={close} />}
          </RecordDialog>
        </div>
      ) : null}
      {remove.error === null ? null : <FormError error={remove.error} />}
      <QueryState query={centers} loadingLabel="Cargando los centros de costo">
        {(data) => (
          <CenterTable
            centers={data.data}
            units={units}
            canManage={canManage}
            onDelete={remove.execute}
          />
        )}
      </QueryState>
    </div>
  );
}
