'use client';

import { createdResponseSchema, siteSchema, type Site } from '@arza/contracts';
import { Badge, DialogFooter, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { Building2 } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { CORE_KEYS, useSites } from './queries';
import { ActiveBadge, CheckboxField, RecordDialog, TextInput } from './record-dialog';

interface SiteValues {
  readonly name: string;
  readonly city: string;
  readonly address: string;
  readonly isMain: boolean;
  readonly isActive: boolean;
}

const EMPTY: SiteValues = { name: '', city: '', address: '', isMain: false, isActive: true };

function bodyOf(values: SiteValues) {
  return {
    name: values.name.trim(),
    city: values.city.trim(),
    address: values.address.trim(),
    is_main: values.isMain,
  };
}

function useSaveSite(site: Site | null, onSaved: () => void) {
  const api = useApiClient();
  return useAdminAction<SiteValues, unknown>({
    run: (values, csrfToken) =>
      site === null
        ? api.post('/v1/sites', { body: bodyOf(values), schema: createdResponseSchema, csrfToken })
        : api.patch(`/v1/sites/${site.id}`, {
            body: { ...bodyOf(values), is_active: values.isActive },
            version: site.version,
            schema: siteSchema,
            csrfToken,
          }),
    invalidate: [CORE_KEYS.sites],
    onSuccess: onSaved,
  });
}

function SiteFields(props: {
  readonly values: SiteValues;
  readonly onChange: (values: SiteValues) => void;
  readonly editing: boolean;
}): JSX.Element {
  const { values, onChange } = props;
  const text = (field: 'name' | 'city' | 'address', id: string, label: string) => (
    <TextInput
      id={id}
      label={label}
      value={values[field]}
      onValue={(v) => {
        onChange({ ...values, [field]: v });
      }}
    />
  );
  return (
    <>
      {text('name', 'sede-nombre', 'Nombre')}
      {text('city', 'sede-ciudad', 'Ciudad')}
      {text('address', 'sede-direccion', 'Dirección')}
      <SiteFlags {...props} />
    </>
  );
}

function SiteFlags(props: {
  readonly values: SiteValues;
  readonly onChange: (values: SiteValues) => void;
  readonly editing: boolean;
}): JSX.Element {
  const { values, onChange } = props;
  return (
    <>
      <CheckboxField
        id="sede-principal"
        label="Es la sede principal"
        hint="Solo una sede es la principal; al marcar esta, la anterior deja de serlo."
        checked={values.isMain}
        onChange={(isMain) => {
          onChange({ ...values, isMain });
        }}
      />
      {props.editing ? (
        <CheckboxField
          id="sede-activa"
          label="Activa"
          checked={values.isActive}
          onChange={(isActive) => {
            onChange({ ...values, isActive });
          }}
        />
      ) : null}
    </>
  );
}

function SiteForm(props: { readonly site: Site | null; readonly onSaved: () => void }) {
  const { site } = props;
  const [values, setValues] = useState<SiteValues>(
    site === null
      ? EMPTY
      : {
          name: site.name,
          city: site.city,
          address: site.address,
          isMain: site.is_main,
          isActive: site.is_active,
        },
  );
  const save = useSaveSite(site, props.onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute(values);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <SiteFields values={values} onChange={setValues} editing={site !== null} />
      <DialogFooter>
        <SubmitButton label="Guardar la sede" pendingLabel="Guardando…" pending={save.pending} />
      </DialogFooter>
      {save.dialog}
    </form>
  );
}

function useDeleteSite() {
  const api = useApiClient();
  return useAdminAction<Site>({
    run: (site, csrfToken) =>
      api.delete(`/v1/sites/${site.id}`, { version: site.version, csrfToken }),
    invalidate: [CORE_KEYS.sites],
  });
}

function SiteRow(props: {
  readonly site: Site;
  readonly canManage: boolean;
  readonly onDelete: (site: Site) => void;
}): JSX.Element {
  const { site } = props;
  return (
    <TableRow>
      <TableCell className="font-medium">
        {site.name} {site.is_main ? <Badge tone="info">Principal</Badge> : null}
      </TableCell>
      <TableCell>{site.city}</TableCell>
      <TableCell>{site.address}</TableCell>
      <TableCell>
        <ActiveBadge active={site.is_active} />
      </TableCell>
      <TableCell className="flex gap-2">
        {props.canManage ? <SiteActions site={site} onDelete={props.onDelete} /> : null}
      </TableCell>
    </TableRow>
  );
}

function SiteActions(props: { readonly site: Site; readonly onDelete: (site: Site) => void }) {
  const { site } = props;
  return (
    <>
      <RecordDialog
        triggerLabel="Editar"
        triggerAriaLabel={`Editar ${site.name}`}
        variant="outline"
        title={`Editar ${site.name}`}
        description="Los cambios quedan en la auditoría."
      >
        {(close) => <SiteForm site={site} onSaved={close} />}
      </RecordDialog>
      {site.is_main ? null : (
        <ConfirmActionButton
          label="Eliminar"
          title={`¿Eliminar la sede ${site.name}?`}
          description="Dejará de aparecer en las listas. Queda en la auditoría."
          confirmLabel="Sí, eliminar"
          disabled={false}
          onConfirm={() => {
            props.onDelete(site);
          }}
        />
      )}
    </>
  );
}

/** Sedes de la empresa; la principal sale primero (ficha 17.1). */
export function SitesPanel(): JSX.Element {
  const sites = useSites();
  const canManage = usePermissions().can('core.org.manage');
  const remove = useDeleteSite();
  return (
    <section aria-labelledby="sedes-titulo" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 id="sedes-titulo" className="text-lg font-semibold">
          Sedes
        </h2>
        {canManage ? (
          <RecordDialog
            triggerLabel="Agregar una sede"
            title="Agregar una sede"
            description="La primera sede queda como principal."
          >
            {(close) => <SiteForm site={null} onSaved={close} />}
          </RecordDialog>
        ) : null}
      </div>
      {remove.error === null ? null : <FormError error={remove.error} />}
      <QueryState query={sites} loadingLabel="Cargando las sedes">
        {(data) => <SitesTable sites={data.data} canManage={canManage} onDelete={remove.execute} />}
      </QueryState>
    </section>
  );
}

function SitesTable(props: {
  readonly sites: readonly Site[];
  readonly canManage: boolean;
  readonly onDelete: (site: Site) => void;
}): JSX.Element {
  return props.sites.length === 0 ? (
    <EmptyState
      icon={<Building2 aria-hidden="true" />}
      title="Todavía no hay sedes"
      description="Agregue la sede principal de la empresa."
    />
  ) : (
    <SimpleTable headers={['Sede', 'Ciudad', 'Dirección', 'Estado', '']}>
      {props.sites.map((site) => (
        <SiteRow key={site.id} site={site} canManage={props.canManage} onDelete={props.onDelete} />
      ))}
    </SimpleTable>
  );
}
