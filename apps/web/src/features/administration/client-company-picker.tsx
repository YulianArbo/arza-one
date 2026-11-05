'use client';

import { FormField, SelectField } from '@arza/ui';
import { useState, type JSX } from 'react';

import { useParties } from '../parties/queries';

// Empresa cliente de una persona del portal (B22A): se busca entre las organizaciones de Terceros
// con el papel de cliente activo. La API revisa igual que lo sea.

export function ClientCompanyPicker(props: {
  readonly value: string;
  readonly error: string | null;
  readonly onChange: (partyId: string) => void;
}): JSX.Element {
  const [search, setSearch] = useState('');
  const parties = useParties({ q: search, role: 'customer', status: 'active' }, null).data?.data;
  const companies = (parties ?? []).filter((party) => party.kind === 'organization');
  const options = [
    { value: '', label: companies.length === 0 ? 'Sin resultados' : 'Elija la empresa' },
    ...companies.map((party) => ({ value: party.id, label: party.name })),
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FormField
        id="invitar-buscar-empresa"
        label="Buscar la empresa cliente"
        type="search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          props.onChange('');
        }}
      />
      <SelectField
        id="invitar-empresa"
        label="Empresa cliente"
        hint="Su nombre y su logo se verán en el portal."
        options={options}
        value={props.value}
        error={props.error ?? undefined}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </div>
  );
}
