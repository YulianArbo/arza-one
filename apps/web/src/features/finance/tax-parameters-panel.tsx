'use client';

import {
  createTaxParameterVersionRequestSchema,
  taxParameterHistoryResponseSchema,
  taxParameterListResponseSchema,
  type TaxParameterSummary,
} from '@arza/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DialogFooter,
  SelectField,
  SimpleTable,
  TableCell,
  TableRow,
  TextareaField,
} from '@arza/ui';
import { useQuery } from '@tanstack/react-query';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { bogotaToday, formatRate } from '../crm/labels';
import { TextFields, type TextFieldSpec } from '../crm/text-fields';
import { RecordDialog } from '../organization/record-dialog';

// Parámetros tributarios vigentes (B23, numeral 12.4): el Contador registra cada tarifa con su
// fundamento legal y la fecha desde la que rige. Un cambio crea una vigencia nueva y cierra la
// anterior el día antes, sin borrarla. Las cotizaciones usan la tarifa vigente el día en que se
// guardan.

const TAX_KEYS = { all: ['finance', 'tax-parameters'] as const };
const NEW_TAX = '__nuevo__';

function useTaxParameters() {
  const api = useApiClient();
  return useQuery({
    queryKey: TAX_KEYS.all,
    queryFn: ({ signal }) =>
      api.get('/v1/finance/tax-parameters', { schema: taxParameterListResponseSchema, signal }),
  });
}

function useTaxHistory(key: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: [...TAX_KEYS.all, key],
    queryFn: ({ signal }) =>
      api.get(`/v1/finance/tax-parameters/${encodeURIComponent(key)}/history`, {
        schema: taxParameterHistoryResponseSchema,
        signal,
      }),
  });
}

interface TaxValues {
  readonly key: string;
  readonly newKey: string;
  readonly label: string;
  readonly rate: string;
  readonly validFrom: string;
  readonly legalBasis: string;
}

function bodyOf(values: TaxValues) {
  const isNew = values.key === NEW_TAX;
  return {
    key: isNew ? values.newKey.trim().toUpperCase() : values.key,
    label: isNew ? values.label.trim() : null,
    rate: values.rate.trim().replace(',', '.'),
    valid_from: values.validFrom,
    legal_basis: values.legalBasis.trim(),
  };
}

const MESSAGES: Readonly<Record<string, string>> = {
  key: 'Use mayúsculas, números y guion bajo: IVA_GENERAL',
  label: 'Escriba el nombre del impuesto.',
  rate: 'Escriba la tarifa en porcentaje, de 0 a 100: 19',
  valid_from: 'Elija desde qué día rige.',
  legal_basis: 'Escriba el fundamento: la norma y el artículo.',
};

function problemsOf(values: TaxValues): Record<string, string> {
  const problems: Record<string, string> = {};
  const body = bodyOf(values);
  const result = createTaxParameterVersionRequestSchema.safeParse(body);
  for (const issue of result.success ? [] : result.error.issues) {
    const field = String(issue.path[0] ?? '');
    problems[field] ??= MESSAGES[field] ?? 'Revise este dato.';
  }
  if (values.key === NEW_TAX && values.label.trim().length < 3)
    problems['label'] = MESSAGES['label'] ?? '';
  if (values.validFrom !== '' && values.validFrom < bogotaToday()) {
    problems['valid_from'] = 'La tarifa debe regir desde hoy o más adelante.';
  }
  return problems;
}

const NEW_FIELDS: readonly TextFieldSpec<'newKey' | 'label'>[] = [
  {
    key: 'newKey',
    field: 'key',
    id: 'impuesto-clave',
    label: 'Clave',
    hint: 'Por ejemplo IVA_REDUCIDO',
  },
  { key: 'label', field: 'label', id: 'impuesto-nombre', label: 'Nombre' },
];

const RATE_FIELDS: readonly TextFieldSpec<'rate' | 'validFrom'>[] = [
  { key: 'rate', field: 'rate', id: 'impuesto-tarifa', label: 'Tarifa en %', decimal: true },
  {
    key: 'validFrom',
    field: 'valid_from',
    id: 'impuesto-desde',
    label: 'Rige desde',
    type: 'date',
  },
];

const SUMMARY_FIELDS = [
  ...NEW_FIELDS,
  ...RATE_FIELDS,
  { field: 'legal_basis', id: 'impuesto-fundamento', label: 'Fundamento legal' },
];

function keyOptionsOf(taxes: readonly TaxParameterSummary[]): { value: string; label: string }[] {
  return [
    ...taxes.map((tax) => ({ value: tax.key, label: tax.label })),
    { value: NEW_TAX, label: 'Un impuesto nuevo' },
  ];
}

function useTaxForm(taxes: readonly TaxParameterSummary[], onDone: () => void) {
  const api = useApiClient();
  const [values, setValues] = useState<TaxValues>({
    key: taxes[0]?.key ?? NEW_TAX,
    newKey: '',
    label: '',
    rate: '',
    validFrom: bogotaToday(),
    legalBasis: '',
  });
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useAdminAction<TaxValues>({
    run: (current, csrfToken) =>
      api.post('/v1/finance/tax-parameters/versions', { body: bodyOf(current), csrfToken }),
    invalidate: [TAX_KEYS.all, ['crm']],
    reason: 'Las tarifas de impuestos cambian los totales de las cotizaciones.',
    onSuccess: onDone,
  });
  const set = (key: keyof TaxValues, text: string): void => {
    setValues({ ...values, [key]: text });
  };
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(values);
    setProblems(found);
    if (Object.keys(found).length === 0) save.execute(values);
  };
  return { values, problems, save, set, submit };
}

function TaxForm(props: {
  readonly taxes: readonly TaxParameterSummary[];
  readonly onDone: () => void;
}): JSX.Element {
  const { values, problems, save, set, submit } = useTaxForm(props.taxes, props.onDone);
  const keyOptions = keyOptionsOf(props.taxes);
  const fields = { values, problems, onChange: set };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <FormSummary problems={problems} fields={SUMMARY_FIELDS} />
      <SelectField
        id="impuesto-cual"
        label="Impuesto"
        options={keyOptions}
        value={values.key}
        onChange={(event) => {
          set('key', event.target.value);
        }}
      />
      {values.key === NEW_TAX ? <TextFields specs={NEW_FIELDS} {...fields} /> : null}
      <TextFields specs={RATE_FIELDS} {...fields} />
      <TextareaField
        id="impuesto-fundamento"
        label="Fundamento legal"
        value={values.legalBasis}
        error={problems['legal_basis'] ?? null}
        onChange={(event) => {
          set('legalBasis', event.target.value);
        }}
      />
      <DialogFooter>
        <SubmitButton label="Registrar" pendingLabel="Registrando…" pending={save.pending} />
      </DialogFooter>
      {save.dialog}
    </form>
  );
}

function History({ taxKey }: { readonly taxKey: string }): JSX.Element {
  const history = useTaxHistory(taxKey);
  return (
    <QueryState query={history} loadingLabel="Cargando el historial">
      {(data) => (
        <SimpleTable
          caption="Historial de tarifas"
          scrollLabel="Historial de tarifas; desplácese a los lados para ver todas las columnas"
          headers={['Tarifa', 'Desde', 'Hasta', 'Fundamento', 'Registró']}
        >
          {data.data.map((version) => (
            <TableRow key={version.id}>
              <TableCell className="tabular-nums">{formatRate(version.rate)}</TableCell>
              <TableCell>{formatDate(version.valid_from)}</TableCell>
              <TableCell>
                {version.valid_to === null ? 'Sigue vigente' : formatDate(version.valid_to)}
              </TableCell>
              <TableCell>{version.legal_basis}</TableCell>
              <TableCell>
                {version.created_by?.name ?? 'El sistema'}
                <span className="block text-xs text-muted-foreground">
                  {formatDateTime(version.created_at)}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </SimpleTable>
      )}
    </QueryState>
  );
}

function TaxCard({ tax }: { readonly tax: TaxParameterSummary }): JSX.Element {
  const today =
    tax.current === null
      ? 'Sin tarifa vigente hoy'
      : `Hoy: ${formatRate(tax.current.rate)}, desde el ${formatDate(tax.current.valid_from)}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {tax.label} <span className="text-sm font-normal text-muted-foreground">({tax.key})</span>
        </CardTitle>
        <CardDescription>
          {today}
          {tax.scheduled === null
            ? ''
            : `. Cambio programado: ${formatRate(tax.scheduled.rate)} desde el ${formatDate(tax.scheduled.valid_from)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <History taxKey={tax.key} />
      </CardContent>
    </Card>
  );
}

export function TaxParametersPanel(): JSX.Element {
  const taxes = useTaxParameters();
  return (
    <QueryState query={taxes} loadingLabel="Cargando los parámetros tributarios">
      {(data) => (
        <div className="flex flex-col gap-4">
          <div>
            <RecordDialog
              triggerLabel="Registrar una tarifa"
              title="Registrar una tarifa"
              description="La tarifa anterior se conserva en el historial hasta el día antes de la nueva."
            >
              {(close) => <TaxForm taxes={data.data} onDone={close} />}
            </RecordDialog>
          </div>
          {data.data.map((tax) => (
            <TaxCard key={tax.key} tax={tax} />
          ))}
        </div>
      )}
    </QueryState>
  );
}
