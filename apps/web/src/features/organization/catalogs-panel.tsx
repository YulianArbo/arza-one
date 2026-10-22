'use client';

import {
  catalogItemSchema,
  createdResponseSchema,
  type CatalogDetailResponse,
  type CatalogItem,
  type CatalogListResponse,
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
import { ListChecks } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { CORE_KEYS, useCatalog, useCatalogs } from './queries';
import { ActiveBadge, CheckboxField, RecordDialog } from './record-dialog';

interface ItemValues {
  readonly code: string;
  readonly label: string;
  readonly sortOrder: string;
  readonly isActive: boolean;
}

function useSaveItem(catalogKey: string, item: CatalogItem | null, onSaved: () => void) {
  const api = useApiClient();
  const path = `/v1/catalogs/${catalogKey}/items`;
  return useAdminAction<ItemValues, unknown>({
    run: (v, csrfToken) => {
      const fields = { label: v.label.trim(), sort_order: Number(v.sortOrder) || 0 };
      if (item === null) {
        const body = { ...fields, code: v.code.trim().toUpperCase() };
        return api.post(path, { body, schema: createdResponseSchema, csrfToken });
      }
      const body = { ...fields, is_active: v.isActive };
      const options = { body, version: item.version, schema: catalogItemSchema, csrfToken };
      return api.patch(`${path}/${item.id}`, options);
    },
    invalidate: [CORE_KEYS.catalog(catalogKey), CORE_KEYS.catalogs],
    onSuccess: onSaved,
  });
}

function ItemFields(props: {
  readonly values: ItemValues;
  readonly onChange: (values: ItemValues) => void;
  readonly editing: boolean;
}): JSX.Element {
  const { values, onChange } = props;
  return (
    <>
      <FormField
        id="opcion-codigo"
        label="Código"
        hint="Corto y en mayúsculas, por ejemplo CC. No se cambia después."
        disabled={props.editing}
        value={values.code}
        onChange={(event) => {
          onChange({ ...values, code: event.target.value });
        }}
      />
      <FormField
        id="opcion-texto"
        label="Texto que se muestra"
        value={values.label}
        onChange={(event) => {
          onChange({ ...values, label: event.target.value });
        }}
      />
      <FormField
        id="opcion-orden"
        label="Orden"
        type="number"
        min={0}
        hint="Las opciones se muestran de menor a mayor."
        value={values.sortOrder}
        onChange={(event) => {
          onChange({ ...values, sortOrder: event.target.value });
        }}
      />
    </>
  );
}

function ItemForm(props: {
  readonly catalogKey: string;
  readonly item: CatalogItem | null;
  readonly onSaved: () => void;
}): JSX.Element {
  const { item } = props;
  const [values, setValues] = useState<ItemValues>({
    code: item?.code ?? '',
    label: item?.label ?? '',
    sortOrder: String(item?.sort_order ?? 0),
    isActive: item?.is_active ?? true,
  });
  const save = useSaveItem(props.catalogKey, item, props.onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute(values);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <ItemFields values={values} onChange={setValues} editing={item !== null} />
      {item === null ? null : (
        <CheckboxField
          id="opcion-activa"
          label="Activa"
          hint="Una opción inactiva deja de ofrecerse en los formularios, pero los registros la conservan."
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

function ItemRow(props: {
  readonly catalogKey: string;
  readonly item: CatalogItem;
  readonly canManage: boolean;
}): JSX.Element {
  const { item } = props;
  return (
    <TableRow>
      <TableCell className="font-medium">{item.code}</TableCell>
      <TableCell>{item.label}</TableCell>
      <TableCell className="text-right">{item.sort_order}</TableCell>
      <TableCell>
        <ActiveBadge active={item.is_active} />
      </TableCell>
      <TableCell>
        {props.canManage ? (
          <RecordDialog
            triggerLabel="Editar"
            triggerAriaLabel={`Editar ${item.label}`}
            variant="outline"
            title={`Editar ${item.label}`}
            description="Los cambios quedan en la auditoría."
          >
            {(close) => <ItemForm catalogKey={props.catalogKey} item={item} onSaved={close} />}
          </RecordDialog>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function CatalogItems(props: {
  readonly catalog: CatalogDetailResponse;
  readonly canManage: boolean;
}) {
  const { catalog, canManage } = props;
  return (
    <section aria-labelledby="catalogo-titulo" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="catalogo-titulo" className="text-lg font-semibold">
            {catalog.name}
          </h2>
          <p className="text-sm text-muted-foreground">{catalog.description}</p>
        </div>
        {canManage ? (
          <RecordDialog
            triggerLabel="Agregar una opción"
            title={`Agregar una opción a ${catalog.name}`}
            description="El código no se repite dentro del catálogo."
          >
            {(close) => <ItemForm catalogKey={catalog.key} item={null} onSaved={close} />}
          </RecordDialog>
        ) : null}
      </div>
      <SimpleTable headers={['Código', 'Texto', 'Orden', 'Estado', '']}>
        {catalog.items.map((item) => (
          <ItemRow key={item.id} catalogKey={catalog.key} item={item} canManage={canManage} />
        ))}
      </SimpleTable>
    </section>
  );
}

function SelectedCatalog({ catalogKey }: { readonly catalogKey: string }): JSX.Element {
  const catalog = useCatalog(catalogKey);
  const canManage = usePermissions().can('core.catalog.manage');
  return (
    <QueryState query={catalog} loadingLabel="Cargando las opciones">
      {(data) => <CatalogItems catalog={data} canManage={canManage} />}
    </QueryState>
  );
}

function CatalogPicker({ catalogs }: { readonly catalogs: CatalogListResponse['data'] }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const first = catalogs[0];
  if (first === undefined) {
    return (
      <EmptyState
        icon={<ListChecks />}
        title="No hay catálogos"
        description="Los catálogos llegan con cada módulo de la plataforma."
      />
    );
  }
  const current = chosen ?? first.key;
  const options = catalogs.map((c) => ({
    value: c.key,
    label: `${c.name} (${String(c.item_count)})`,
  }));
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-md">
        <SelectField
          id="catalogo"
          label="Catálogo"
          options={options}
          value={current}
          onChange={(event) => {
            setChosen(event.target.value);
          }}
        />
      </div>
      <SelectedCatalog catalogKey={current} />
    </div>
  );
}

/** Catálogos administrables: listas que usan los formularios (ficha 17.1). */
export function CatalogsPanel(): JSX.Element {
  const catalogs = useCatalogs();
  return (
    <QueryState query={catalogs} loadingLabel="Cargando los catálogos">
      {(data) => <CatalogPicker catalogs={data.data} />}
    </QueryState>
  );
}
