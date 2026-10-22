'use client';

import { FormField } from '@arza/ui';
import { tenantProfileSchema, type TenantProfile } from '@arza/contracts';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError, FormSuccess } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { CORE_KEYS, useTenant } from './queries';

interface TenantValues {
  readonly legalName: string;
  readonly tradeName: string;
  readonly taxId: string;
}

function useSaveTenant(version: number) {
  const api = useApiClient();
  return useAdminAction<TenantValues, TenantProfile>({
    run: (values, csrfToken) => {
      const tradeName = values.tradeName.trim();
      const body = {
        legal_name: values.legalName.trim(),
        trade_name: tradeName === '' ? null : tradeName,
        tax_id: values.taxId.trim(),
      };
      return api.patch('/v1/tenant', { body, version, schema: tenantProfileSchema, csrfToken });
    },
    invalidate: [CORE_KEYS.tenant],
  });
}

function TenantFields(props: {
  readonly values: TenantValues;
  readonly onChange: (values: TenantValues) => void;
  readonly disabled: boolean;
}): JSX.Element {
  const { values, onChange, disabled } = props;
  return (
    <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
      <FormField
        id="empresa-razon-social"
        label="Razón social"
        value={values.legalName}
        onChange={(event) => {
          onChange({ ...values, legalName: event.target.value });
        }}
      />
      <FormField
        id="empresa-nombre-comercial"
        label="Nombre comercial (opcional)"
        value={values.tradeName}
        onChange={(event) => {
          onChange({ ...values, tradeName: event.target.value });
        }}
      />
      <FormField
        id="empresa-nit"
        label="NIT"
        hint="Con el dígito de verificación, por ejemplo 900123456-7."
        value={values.taxId}
        onChange={(event) => {
          onChange({ ...values, taxId: event.target.value });
        }}
      />
    </fieldset>
  );
}

function TenantEditor({ tenant }: { readonly tenant: TenantProfile }): JSX.Element {
  const [values, setValues] = useState<TenantValues>({
    legalName: tenant.legal_name,
    tradeName: tenant.trade_name ?? '',
    taxId: tenant.tax_id,
  });
  const canEdit = usePermissions().can('core.tenant.update');
  const save = useSaveTenant(tenant.version);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute(values);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4" aria-label="Datos legales">
      {save.error === null ? null : <FormError error={save.error} />}
      {save.result === undefined ? null : <FormSuccess message="Datos de la empresa guardados." />}
      <TenantFields values={values} onChange={setValues} disabled={!canEdit} />
      {canEdit ? (
        <div>
          <SubmitButton
            label="Guardar los datos"
            pendingLabel="Guardando…"
            pending={save.pending}
          />
        </div>
      ) : null}
      {save.dialog}
    </form>
  );
}

/** Datos legales de la empresa, que salen en los documentos que genera la plataforma. */
export function TenantForm(): JSX.Element {
  const tenant = useTenant();
  return (
    <QueryState query={tenant} loadingLabel="Cargando los datos de la empresa">
      {(data) => <TenantEditor key={data.version} tenant={data} />}
    </QueryState>
  );
}
