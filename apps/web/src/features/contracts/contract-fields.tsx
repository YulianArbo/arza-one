'use client';

import { contractRenewalSchema, type ContractOptions } from '@arza/contracts';
import { Button, SelectField, TextareaField } from '@arza/ui';
import type { JSX } from 'react';

import type { SummaryField } from '../../components/form-summary';
import { optionsOf } from '../crm/labels';
import { TextFields, type TextFieldSpec } from '../crm/text-fields';
import type { ContractValues } from './contract-form-values';
import { CONTRACT_RENEWALS } from './labels';

// Los datos del contrato (B24), los mismos en el asistente y en la edición del borrador: título,
// objeto, valor, forma de pago, fechas, renovación y quién firma por el cliente.

type TextKey = 'title' | 'value' | 'startsOn' | 'endsOn' | 'signerName' | 'signerDocument';

const TEXTS: readonly TextFieldSpec<TextKey>[] = [
  { key: 'title', field: 'title', id: 'contrato-titulo', label: 'Título corto' },
  {
    key: 'value',
    field: 'value',
    id: 'contrato-valor',
    label: 'Valor total en pesos, impuestos incluidos',
    hint: 'Sin puntos de miles: 12000000.50. Vacío solo en un acuerdo de confidencialidad.',
    decimal: true,
  },
  { key: 'startsOn', field: 'starts_on', id: 'contrato-inicio', label: 'Inicio', type: 'date' },
  { key: 'endsOn', field: 'ends_on', id: 'contrato-fin', label: 'Terminación', type: 'date' },
  {
    key: 'signerName',
    field: 'client_signer_name',
    id: 'contrato-firmante',
    label: 'Quién firma por el cliente',
  },
  {
    key: 'signerDocument',
    field: 'client_signer_document',
    id: 'contrato-firmante-documento',
    label: 'Documento de quien firma',
    hint: 'Por ejemplo: CC 43000000',
  },
];

export const DATA_FIELDS: readonly SummaryField[] = [
  ...TEXTS.slice(0, 1),
  { field: 'object', id: 'contrato-objeto', label: 'Objeto' },
  ...TEXTS.slice(1, 2),
  { field: 'payment_terms', id: 'contrato-pago', label: 'Forma de pago' },
  ...TEXTS.slice(2),
];

const RENEWAL_OPTIONS = optionsOf(contractRenewalSchema.options, CONTRACT_RENEWALS);

type Set = (patch: Partial<ContractValues>) => void;

/** Firmantes autorizados del cliente en Terceros: un clic llena los dos campos. */
function SignerSuggestions(props: {
  readonly signers: ContractOptions['signers'];
  readonly set: Set;
}): JSX.Element | null {
  if (props.signers.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">Firmantes autorizados en Terceros:</span>
      {props.signers.map((signer) => (
        <Button
          key={`${signer.name}-${signer.document ?? ''}`}
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            props.set({ signerName: signer.name, signerDocument: signer.document ?? '' });
          }}
        >
          Usar a {signer.name}
        </Button>
      ))}
    </div>
  );
}

interface FieldsProps {
  readonly values: ContractValues;
  readonly problems: Readonly<Record<string, string>>;
  readonly set: Set;
}

function Texts(props: FieldsProps & { readonly specs: readonly TextFieldSpec<TextKey>[] }) {
  return (
    <TextFields
      specs={props.specs}
      values={props.values}
      problems={props.problems}
      onChange={(key, text) => {
        props.set({ [key]: text });
      }}
    />
  );
}

/** Qué se contrata, cuánto vale y cómo se paga. */
function WhatFields(props: FieldsProps): JSX.Element {
  const { values, problems, set } = props;
  return (
    <>
      <Texts {...props} specs={TEXTS.slice(0, 1)} />
      <TextareaField
        id="contrato-objeto"
        label="Objeto: qué se contrata"
        rows={3}
        value={values.object}
        error={problems['object'] ?? null}
        onChange={(event) => {
          set({ object: event.target.value });
        }}
      />
      <Texts {...props} specs={TEXTS.slice(1, 2)} />
      <TextareaField
        id="contrato-pago"
        label="Forma de pago"
        rows={2}
        value={values.paymentTerms}
        error={problems['payment_terms'] ?? null}
        onChange={(event) => {
          set({ paymentTerms: event.target.value });
        }}
      />
    </>
  );
}

export function ContractDataFields(
  props: FieldsProps & { readonly signers: ContractOptions['signers'] },
): JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <WhatFields {...props} />
      <Texts {...props} specs={TEXTS.slice(2, 4)} />
      <SelectField
        id="contrato-renovacion"
        label="Renovación"
        options={RENEWAL_OPTIONS}
        value={props.values.renewal}
        onChange={(event) => {
          props.set({ renewal: contractRenewalSchema.parse(event.target.value) });
        }}
      />
      <div className="sm:col-span-2">
        <SignerSuggestions signers={props.signers} set={props.set} />
      </div>
      <Texts {...props} specs={TEXTS.slice(4)} />
    </div>
  );
}
