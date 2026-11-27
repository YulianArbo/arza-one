'use client';

import {
  contrastWithWhite,
  MIN_BRAND_CONTRAST,
  tenantBrandingSchema,
  type TenantBranding,
} from '@arza/contracts';
import { FormField } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError, FormSuccess } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { ImageField } from '../media/image-field';
import { usePermissions } from '../session/permissions';
import { BRANDING_LOGO_PATH } from './labels';
import { TENANCY_KEYS, useBranding } from './queries';

// Marca propia de la empresa (B48, decisión 11): nombre para mostrar, color principal y logo. Se
// ven en la barra de la aplicación y del portal. El color debe leerse bien sobre blanco.

interface BrandValues {
  readonly displayName: string;
  readonly color: string;
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Problema del color escrito, para mostrarlo junto al campo; null si sirve o está vacío. */
export function colorProblem(color: string): string | null {
  const value = color.trim();
  if (value === '') return null;
  if (!HEX.test(value)) return 'Escriba el color como #RRGGBB, por ejemplo #1F4E79.';
  if (contrastWithWhite(value) < MIN_BRAND_CONTRAST) {
    return 'Ese color no se lee bien sobre fondo blanco. Elija uno más oscuro.';
  }
  return null;
}

function useSaveBranding(version: number) {
  const api = useApiClient();
  return useAdminAction<BrandValues, TenantBranding>({
    run: (values, csrfToken) => {
      const name = values.displayName.trim();
      const color = values.color.trim();
      const body = {
        display_name: name === '' ? null : name,
        primary_color: color === '' ? null : color.toUpperCase(),
      };
      return api.put('/v1/tenant/branding', {
        body,
        version,
        schema: tenantBrandingSchema,
        csrfToken,
      });
    },
    invalidate: [TENANCY_KEYS.branding],
    successMessage: 'La marca de la empresa quedó guardada.',
  });
}

function ColorSample({ color }: { readonly color: string }): JSX.Element | null {
  if (!HEX.test(color.trim()) || colorProblem(color) !== null) return null;
  return (
    <span className="flex items-center gap-2 text-sm text-muted-foreground">
      <span
        aria-hidden="true"
        className="inline-block size-6 rounded-md border"
        style={{ backgroundColor: color.trim() }}
      />
      Así se verá el color.
    </span>
  );
}

function BrandFields(props: {
  readonly values: BrandValues;
  readonly onChange: (values: BrandValues) => void;
  readonly disabled: boolean;
}): JSX.Element {
  const { values, onChange } = props;
  return (
    <fieldset disabled={props.disabled} className="grid gap-4 sm:grid-cols-2">
      <FormField
        id="marca-nombre"
        label="Nombre para mostrar"
        hint="Si lo deja vacío se muestra el nombre comercial o la razón social."
        value={values.displayName}
        onChange={(event) => {
          onChange({ ...values, displayName: event.target.value });
        }}
      />
      <div className="flex flex-col gap-2">
        <FormField
          id="marca-color"
          label="Color principal (opcional)"
          hint="Como #RRGGBB. Debe leerse bien sobre fondo blanco."
          value={values.color}
          error={colorProblem(values.color)}
          onChange={(event) => {
            onChange({ ...values, color: event.target.value });
          }}
        />
        <ColorSample color={values.color} />
      </div>
    </fieldset>
  );
}

function BrandEditor({ brand }: { readonly brand: TenantBranding }): JSX.Element {
  const canEdit = usePermissions().can('core.tenant.update');
  const [values, setValues] = useState<BrandValues>({
    displayName: brand.display_name,
    color: brand.primary_color ?? '',
  });
  const save = useSaveBranding(brand.version);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (colorProblem(values.color) === null) save.execute(values);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4" aria-label="Marca">
      {save.error === null ? null : <FormError error={save.error} />}
      {save.result === undefined ? null : <FormSuccess message="Marca de la empresa guardada." />}
      <BrandFields values={values} onChange={setValues} disabled={!canEdit} />
      {canEdit ? (
        <div>
          <SubmitButton label="Guardar la marca" pendingLabel="Guardando…" pending={save.pending} />
        </div>
      ) : null}
      {save.dialog}
    </form>
  );
}

const LOGO_TARGET = {
  uploads: '/v1/tenant/branding/logo/uploads',
  image: '/v1/tenant/branding/logo',
  view: BRANDING_LOGO_PATH,
  refresh: [TENANCY_KEYS.branding],
};

/** Marca de la empresa: nombre, color y logo. */
export function BrandingPanel(): JSX.Element {
  const branding = useBranding();
  const canEdit = usePermissions().can('core.tenant.update');
  return (
    <section aria-labelledby="marca-titulo" className="flex flex-col gap-4">
      <div>
        <h2 id="marca-titulo" className="text-lg font-semibold">
          Marca de la empresa
        </h2>
        <p className="text-sm text-muted-foreground">
          Se ve en la barra superior de la aplicación y del portal de sus clientes.
        </p>
      </div>
      <QueryState query={branding} loadingLabel="Cargando la marca de la empresa">
        {(brand) => (
          <div className="flex flex-col gap-6">
            <BrandEditor key={brand.version} brand={brand} />
            <ImageField
              target={LOGO_TARGET}
              name={brand.display_name}
              hasImage={brand.has_logo}
              noun="logo"
              editable={canEdit}
            />
          </div>
        )}
      </QueryState>
    </section>
  );
}
