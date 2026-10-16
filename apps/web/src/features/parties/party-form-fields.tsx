'use client';

import { NIT_ID_TYPE, partyRoleSchema, type PartyRole } from '@arza/contracts';
import type { JSX } from 'react';

import { FormField } from '../access/form-field';
import { SelectField } from '../administration/select-field';
import { useCatalog } from '../organization/queries';
import { CheckboxField } from '../organization/record-dialog';
import { ROLE_LABELS } from './labels';
import type { FieldErrors, PartyFormValues } from './party-form-values';

// Campos del formulario del tercero (B13): los de su tipo y el documento con su dígito de
// verificación. La autorización de la persona la pone el componente de privacidad (B17).

interface FieldsProps {
  readonly values: PartyFormValues;
  readonly errors: FieldErrors;
  readonly onChange: (values: PartyFormValues) => void;
  /** Al salir de un campo que sirve para buscar duplicados. */
  readonly onProbe: () => void;
}

type TextKey =
  | 'legalName'
  | 'tradeName'
  | 'firstName'
  | 'lastName'
  | 'idNumber'
  | 'email'
  | 'phone'
  | 'city'
  | 'address';

interface TextProps {
  readonly form: FieldsProps;
  readonly name: TextKey;
  readonly label: string;
  /** Campo del contrato cuyo problema se muestra aquí. */
  readonly field?: string;
  readonly hint?: string;
  /** Sirve para buscar duplicados al salir del campo. */
  readonly probe?: boolean;
}

function Text({ form, name, label, field, hint, probe }: TextProps): JSX.Element {
  return (
    <FormField
      id={`tercero-${name}`}
      label={label}
      type="text"
      value={form.values[name]}
      error={field === undefined ? null : (form.errors[field] ?? null)}
      {...(hint === undefined ? {} : { hint })}
      {...(probe === true ? { onBlur: form.onProbe } : {})}
      onChange={(event) => {
        form.onChange({ ...form.values, [name]: event.target.value });
      }}
    />
  );
}

function useCatalogOptions(key: string, placeholder: string) {
  const items = useCatalog(key).data?.items ?? [];
  const active = items.filter((item) => item.is_active);
  return [
    { value: '', label: placeholder },
    ...active.map((item) => ({ value: item.code, label: item.label })),
  ];
}

function NameFields({ form }: { readonly form: FieldsProps }): JSX.Element {
  if (form.values.kind === 'organization') {
    return (
      <>
        <Text form={form} name="legalName" label="Razón social" field="legal_name" probe />
        <Text form={form} name="tradeName" label="Nombre comercial (opcional)" />
      </>
    );
  }
  return (
    <>
      <Text form={form} name="firstName" label="Nombres" field="first_name" />
      <Text form={form} name="lastName" label="Apellidos" field="last_name" probe />
    </>
  );
}

function CheckDigit({ form }: { readonly form: FieldsProps }): JSX.Element {
  return (
    <FormField
      id="tercero-digito"
      label="Dígito de verificación"
      inputMode="numeric"
      maxLength={1}
      value={form.values.checkDigit}
      error={form.errors['check_digit'] ?? null}
      onChange={(event) => {
        form.onChange({ ...form.values, checkDigit: event.target.value.replaceAll(/\D/g, '') });
      }}
    />
  );
}

const NIT_HINT = { hint: 'Sin puntos, sin guion y sin el dígito de verificación.' };

function DocumentFields({ form }: { readonly form: FieldsProps }): JSX.Element {
  const types = useCatalogOptions('identification_types', 'Elija el tipo');
  const isNit = form.values.idType === NIT_ID_TYPE;
  return (
    <div className="grid gap-3 sm:grid-cols-[12rem_1fr_8rem]">
      <SelectField
        id="tercero-tipo-documento"
        label="Tipo de documento"
        options={types}
        value={form.values.idType}
        error={form.errors['id_type']}
        onChange={(event) => {
          form.onChange({ ...form.values, idType: event.target.value, checkDigit: '' });
        }}
      />
      <Text
        form={form}
        name="idNumber"
        label="Número de documento"
        field="id_number"
        probe
        {...(isNit ? NIT_HINT : {})}
      />
      {isNit ? <CheckDigit form={form} /> : null}
    </div>
  );
}

function ContactFields({ form }: { readonly form: FieldsProps }): JSX.Element {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Text form={form} name="email" label="Correo (opcional)" field="email" probe />
      <Text form={form} name="phone" label="Teléfono (opcional)" field="phone" probe />
      <Text form={form} name="city" label="Ciudad (opcional)" />
      <Text form={form} name="address" label="Dirección (opcional)" />
    </div>
  );
}

/** Papeles con que nace el tercero; después se cambian desde su ficha. */
export function RoleChoices(props: {
  readonly roles: readonly PartyRole[];
  readonly onChange: (roles: PartyRole[]) => void;
}): JSX.Element {
  const toggle = (role: PartyRole, checked: boolean): void => {
    props.onChange(checked ? [...props.roles, role] : props.roles.filter((item) => item !== role));
  };
  return (
    <fieldset className="flex flex-wrap gap-4">
      <legend className="mb-1 text-sm font-medium">Papeles</legend>
      {partyRoleSchema.options.map((role) => (
        <CheckboxField
          key={role}
          id={`tercero-papel-${role}`}
          label={ROLE_LABELS[role]}
          checked={props.roles.includes(role)}
          onChange={(checked) => {
            toggle(role, checked);
          }}
        />
      ))}
    </fieldset>
  );
}

export function PartyFields(props: FieldsProps): JSX.Element {
  return (
    <>
      <NameFields form={props} />
      <DocumentFields form={props} />
      <ContactFields form={props} />
    </>
  );
}
