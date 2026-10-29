'use client';

import { serviceUnitSchema, type QuoteOptions, type QuoteTotals } from '@arza/contracts';
import { Alert, AlertDescription, Button, FormField, SelectField } from '@arza/ui';
import { Trash2 } from 'lucide-react';
import { useState, type JSX } from 'react';

import type { SummaryField } from '../../components/form-summary';
import { SERVICE_UNITS, formatPesos, formatRate, optionsOf } from './labels';
import { emptyItem, itemFromService, type ItemValues } from './quote-form-values';

// Paso 2 del asistente (B23): los ítems, tomados del portafolio o escritos a mano, con su cantidad,
// precio, descuento e impuesto. El total de cada línea y el de la cotización se ven al escribir.

const UNIT_OPTIONS = optionsOf(serviceUnitSchema.options, SERVICE_UNITS);

type ItemField = 'description' | 'quantity' | 'unitPrice' | 'discountPercent';

const ITEM_FIELDS: readonly { key: ItemField; field: string; label: string; decimal: boolean }[] = [
  { key: 'description', field: 'description', label: 'Descripción', decimal: false },
  { key: 'quantity', field: 'quantity', label: 'Cantidad', decimal: true },
  { key: 'unitPrice', field: 'unit_price', label: 'Valor unitario en pesos', decimal: true },
  { key: 'discountPercent', field: 'discount_percent', label: 'Descuento en %', decimal: true },
];

function fieldId(index: number, field: string): string {
  return `item-${String(index + 1)}-${field}`;
}

/** Campos del resumen de errores de los ítems, en el orden de la pantalla. */
export function itemSummaryFields(count: number): SummaryField[] {
  const fields: SummaryField[] = [{ field: 'items', id: 'agregar-servicio', label: 'Ítems' }];
  for (let index = 0; index < count; index += 1) {
    for (const item of ITEM_FIELDS) {
      fields.push({
        field: `items.${String(index)}.${item.field}`,
        id: fieldId(index, item.field),
        label: `Ítem ${String(index + 1)}, ${item.label.toLowerCase()}`,
      });
    }
  }
  return fields;
}

interface EditorProps {
  readonly index: number;
  readonly item: ItemValues;
  readonly taxes: QuoteOptions['taxes'];
  readonly lineTotal: string | null;
  readonly problems: Readonly<Record<string, string>>;
  readonly onChange: (item: ItemValues) => void;
  readonly onRemove: () => void;
}

function ItemSelects(props: EditorProps): JSX.Element {
  const { index, item } = props;
  const taxOptions = props.taxes.map((tax) => ({
    value: tax.key,
    label: `${tax.label} (${formatRate(tax.rate)})`,
  }));
  return (
    <>
      <SelectField
        id={fieldId(index, 'unit')}
        label="Unidad"
        options={UNIT_OPTIONS}
        value={item.unit}
        onChange={(event) => {
          props.onChange({ ...item, unit: event.target.value });
        }}
      />
      <SelectField
        id={fieldId(index, 'tax')}
        label="Impuesto"
        options={taxOptions}
        value={item.taxKey}
        onChange={(event) => {
          props.onChange({ ...item, taxKey: event.target.value });
        }}
      />
    </>
  );
}

function ItemFooter(props: EditorProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm">
        Total de la línea:{' '}
        <span className="font-medium tabular-nums">
          {props.lineTotal === null ? '—' : formatPesos(props.lineTotal)}
        </span>
      </p>
      <Button type="button" variant="ghost" size="sm" onClick={props.onRemove}>
        <Trash2 aria-hidden="true" />
        Quitar el ítem {props.index + 1}
      </Button>
    </div>
  );
}

function ItemEditor(props: EditorProps): JSX.Element {
  const { index, item } = props;
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border p-4">
      <legend className="px-1 text-sm font-medium">Ítem {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {ITEM_FIELDS.map((spec) => (
          <FormField
            key={spec.key}
            id={fieldId(index, spec.field)}
            label={spec.label}
            value={item[spec.key]}
            error={props.problems[`items.${String(index)}.${spec.field}`] ?? null}
            {...(spec.decimal ? { inputMode: 'decimal' as const } : {})}
            onChange={(event) => {
              props.onChange({ ...item, [spec.key]: event.target.value });
            }}
          />
        ))}
        <ItemSelects {...props} />
      </div>
      <ItemFooter {...props} />
    </fieldset>
  );
}

function AddItem(props: {
  readonly options: QuoteOptions;
  readonly onAdd: (item: ItemValues) => void;
}): JSX.Element {
  const [serviceId, setServiceId] = useState('');
  const services = props.options.services.map((service) => ({
    value: service.id,
    label: `${service.code} · ${service.name} · ${formatPesos(service.base_price)}`,
  }));
  const add = (): void => {
    const service = props.options.services.find((candidate) => candidate.id === serviceId);
    if (service !== undefined) props.onAdd(itemFromService(service));
    setServiceId('');
  };
  const addFree = (): void => {
    props.onAdd(emptyItem());
  };
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      <SelectField
        id="agregar-servicio"
        label="Servicio del portafolio"
        options={[{ value: '', label: 'Elija un servicio' }, ...services]}
        value={serviceId}
        onChange={(event) => {
          setServiceId(event.target.value);
        }}
      />
      <Button type="button" variant="outline" disabled={serviceId === ''} onClick={add}>
        Agregar del portafolio
      </Button>
      <Button type="button" variant="outline" onClick={addFree}>
        Agregar ítem libre
      </Button>
    </div>
  );
}

function ApprovalNotice({ cap }: { readonly cap: string | null }): JSX.Element {
  return (
    <Alert tone="warning">
      <AlertDescription>
        Un descuento pasa el tope de {formatRate(cap ?? '0')}: al pedir el envío, la cotización irá
        a la Dirección para su aprobación.
      </AlertDescription>
    </Alert>
  );
}

export function QuoteItemsStep(props: {
  readonly items: readonly ItemValues[];
  readonly options: QuoteOptions;
  readonly totals: QuoteTotals | null;
  readonly approvalNeeded: boolean;
  readonly problems: Readonly<Record<string, string>>;
  readonly onChange: (items: readonly ItemValues[]) => void;
}): JSX.Element {
  const { items, onChange } = props;
  return (
    <div className="flex flex-col gap-4">
      <AddItem
        options={props.options}
        onAdd={(item) => {
          onChange([...items, item]);
        }}
      />
      {items.map((item, index) => (
        <ItemEditor
          key={item.key}
          index={index}
          item={item}
          taxes={props.options.taxes}
          lineTotal={props.totals?.lines[index]?.total ?? null}
          problems={props.problems}
          onChange={(next) => {
            onChange(items.map((current, at) => (at === index ? next : current)));
          }}
          onRemove={() => {
            onChange(items.filter((_item, at) => at !== index));
          }}
        />
      ))}
      {props.approvalNeeded ? <ApprovalNotice cap={props.options.discount_cap} /> : null}
    </div>
  );
}
