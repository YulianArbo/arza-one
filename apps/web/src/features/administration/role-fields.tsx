'use client';

import type { JSX } from 'react';

import { FormField } from '../access/form-field';

export interface RoleTextValues {
  readonly name: string;
  readonly description: string;
}

interface RoleFieldsProps {
  readonly idPrefix: string;
  readonly values: RoleTextValues;
  readonly onChange: (values: RoleTextValues) => void;
  readonly nameError?: string | null;
}

/** Nombre y descripción de un rol personalizado. */
export function RoleFields({
  idPrefix,
  values,
  onChange,
  nameError,
}: RoleFieldsProps): JSX.Element {
  return (
    <>
      <FormField
        id={`${idPrefix}-nombre`}
        label="Nombre"
        hint="Por ejemplo «Apoyo comercial». Mínimo 3 caracteres."
        error={nameError ?? null}
        value={values.name}
        onChange={(event) => {
          onChange({ ...values, name: event.target.value });
        }}
      />
      <FormField
        id={`${idPrefix}-descripcion`}
        label="Para qué sirve (opcional)"
        value={values.description}
        onChange={(event) => {
          onChange({ ...values, description: event.target.value });
        }}
      />
    </>
  );
}

/** Cuerpo de la API con el nombre y la descripción ya recortados. */
export function roleTextBody(values: RoleTextValues): { name: string; description: string | null } {
  const description = values.description.trim();
  return { name: values.name.trim(), description: description === '' ? null : description };
}
