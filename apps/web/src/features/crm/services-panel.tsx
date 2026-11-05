'use client';

import {
  createdResponseSchema,
  serviceRequestSchema,
  serviceUnitSchema,
  type Service,
} from '@arza/contracts';
import {
  Badge,
  Checkbox,
  DialogFooter,
  EmptyState,
  SelectField,
  SimpleTable,
  TableCell,
  TableRow,
  TextareaField,
} from '@arza/ui';
import { Package } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import { FormSummary } from '../../components/form-summary';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { useCrmAction } from './crm-action';
import { SERVICE_UNITS, formatPesos, formatRate, optionsOf } from './labels';
import { useQuoteOptions, useServices } from './queries';
import { TextFields, type TextFieldSpec } from './text-fields';

// Portafolio de servicios con sus tarifas (B23, ficha 17.6). Lo administra quien tiene
// crm.service.manage; un servicio inactivo deja de ofrecerse en cotizaciones nuevas.

const UNIT_OPTIONS = optionsOf(serviceUnitSchema.options, SERVICE_UNITS);

interface ServiceValues {
  readonly name: string;
  readonly description: string;
  readonly unit: string;
  readonly basePrice: string;
  readonly taxKey: string;
  readonly isActive: boolean;
}

function valuesOf(service: Service | null): ServiceValues {
  return {
    name: service?.name ?? '',
    description: service?.description ?? '',
    unit: service?.unit ?? 'hour',
    basePrice: service?.base_price ?? '',
    taxKey: service?.tax_key ?? 'IVA_GENERAL',
    isActive: service?.is_active ?? true,
  };
}

function bodyOf(values: ServiceValues) {
  return {
    name: values.name.trim(),
    description: values.description.trim() === '' ? null : values.description.trim(),
    unit: values.unit,
    base_price: values.basePrice.trim(),
    tax_key: values.taxKey,
    is_active: values.isActive,
  };
}

const MESSAGES: Readonly<Record<string, string>> = {
  name: 'Escriba al menos tres letras.',
  base_price: 'Escriba el valor en pesos, sin puntos de miles: 1500000.50',
  tax_key: 'Elija el impuesto.',
};

function problemsOf(values: ServiceValues): Record<string, string> {
  const result = serviceRequestSchema.safeParse(bodyOf(values));
  if (result.success) return {};
  const problems: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    problems[field] ??= MESSAGES[field] ?? 'Revise este dato.';
  }
  return problems;
}

const NAME_FIELD: readonly TextFieldSpec<'name'>[] = [
  { key: 'name', field: 'name', id: 'servicio-nombre', label: 'Nombre' },
];

const PRICE_FIELD: readonly TextFieldSpec<'basePrice'>[] = [
  {
    key: 'basePrice',
    field: 'base_price',
    id: 'servicio-precio',
    label: 'Tarifa en pesos, antes de impuestos',
    decimal: true,
  },
];

function useServiceForm(service: Service | null, onDone: () => void) {
  const api = useApiClient();
  const [values, setValues] = useState(valuesOf(service));
  const [problems, setProblems] = useState<Record<string, string>>({});
  const save = useCrmAction<ServiceValues>(async (current, csrfToken) => {
    const body = bodyOf(current);
    if (service === null) {
      await api.post('/v1/crm/services', { body, schema: createdResponseSchema, csrfToken });
      return;
    }
    await api.put(`/v1/crm/services/${service.id}`, { body, version: service.version, csrfToken });
  }, onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = problemsOf(values);
    setProblems(found);
    if (Object.keys(found).length === 0) save.execute(values);
  };
  const set = <K extends keyof ServiceValues>(key: K, value: ServiceValues[K]): void => {
    setValues({ ...values, [key]: value });
  };
  return { values, problems, save, submit, set };
}

type ServiceFormState = ReturnType<typeof useServiceForm>;

function ChoiceFields(props: { readonly form: ServiceFormState }): JSX.Element {
  const { form } = props;
  const options = useQuoteOptions();
  const taxes = (options.data?.taxes ?? []).map((tax) => ({
    value: tax.key,
    label: `${tax.label} (${formatRate(tax.rate)})`,
  }));
  return (
    <>
      <SelectField
        id="servicio-unidad"
        label="Unidad en que se cobra"
        options={UNIT_OPTIONS}
        value={form.values.unit}
        onChange={(event) => {
          form.set('unit', event.target.value);
        }}
      />
      <SelectField
        id="servicio-impuesto"
        label="Impuesto"
        options={taxes.length === 0 ? [{ value: form.values.taxKey, label: 'Cargando…' }] : taxes}
        value={form.values.taxKey}
        error={form.problems['tax_key']}
        onChange={(event) => {
          form.set('taxKey', event.target.value);
        }}
      />
    </>
  );
}

function ActiveBox(props: { readonly form: ServiceFormState }): JSX.Element {
  const { form } = props;
  return (
    <label htmlFor="servicio-activo" className="flex items-center gap-2 text-sm">
      <Checkbox
        id="servicio-activo"
        checked={form.values.isActive}
        onChange={(event) => {
          form.set('isActive', event.target.checked);
        }}
      />
      Activo: se ofrece en las cotizaciones nuevas
    </label>
  );
}

function ServiceForm(props: {
  readonly service: Service | null;
  readonly onDone: () => void;
}): JSX.Element {
  const form = useServiceForm(props.service, props.onDone);
  const onText = (key: 'name' | 'basePrice', text: string): void => {
    form.set(key, text);
  };
  const fields = { values: form.values, problems: form.problems, onChange: onText };
  return (
    <form noValidate onSubmit={form.submit} className="flex flex-col gap-4">
      {form.save.error === null ? null : <FormError error={form.save.error} />}
      <FormSummary problems={form.problems} fields={[...NAME_FIELD, ...PRICE_FIELD]} />
      <TextFields specs={NAME_FIELD} {...fields} />
      <TextareaField
        id="servicio-descripcion"
        label="Qué incluye (opcional; sale en la cotización)"
        value={form.values.description}
        onChange={(event) => {
          form.set('description', event.target.value);
        }}
      />
      <TextFields specs={PRICE_FIELD} {...fields} />
      <ChoiceFields form={form} />
      {props.service === null ? null : <ActiveBox form={form} />}
      <DialogFooter>
        <SubmitButton label="Guardar" pendingLabel="Guardando…" pending={form.save.pending} />
      </DialogFooter>
      {form.save.dialog}
    </form>
  );
}

function ServiceRow(props: { readonly service: Service; readonly canManage: boolean }) {
  const { service } = props;
  return (
    <TableRow>
      <TableCell className="tabular-nums">{service.code}</TableCell>
      <TableCell>
        <span className="font-medium">{service.name}</span>
        {service.description === null ? null : (
          <span className="block text-xs text-muted-foreground">{service.description}</span>
        )}
      </TableCell>
      <TableCell>{SERVICE_UNITS[service.unit]}</TableCell>
      <TableCell className="tabular-nums">{formatPesos(service.base_price)}</TableCell>
      <TableCell>{service.tax_label}</TableCell>
      <TableCell>
        <Badge tone={service.is_active ? 'success' : 'neutral'}>
          {service.is_active ? 'Activo' : 'Inactivo'}
        </Badge>
      </TableCell>
      <TableCell>
        {props.canManage ? (
          <RecordDialog
            triggerLabel="Editar"
            triggerAriaLabel={`Editar ${service.name}`}
            variant="outline"
            title={`Editar ${service.name}`}
            description="Las cotizaciones que ya lo usan conservan sus valores."
          >
            {(close) => <ServiceForm service={service} onDone={close} />}
          </RecordDialog>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function ServicesPanel(): JSX.Element {
  const query = useServices({ view: 'all' });
  const canManage = usePermissions().can('crm.service.manage');
  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div>
          <RecordDialog
            triggerLabel="Agregar servicio"
            title="Agregar servicio al portafolio"
            description="Con su tarifa y su impuesto, para ofrecerlo en las cotizaciones."
          >
            {(close) => <ServiceForm service={null} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <QueryState query={query} loadingLabel="Cargando el portafolio">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<Package />}
              title="El portafolio está vacío"
              description="Agregue los servicios que ofrece la empresa con su tarifa vigente."
            />
          ) : (
            <SimpleTable
              caption="Servicios del portafolio"
              scrollLabel="Servicios del portafolio; desplácese a los lados para ver todas las columnas"
              headers={['Código', 'Servicio', 'Unidad', 'Tarifa', 'Impuesto', 'Estado', '']}
            >
              {data.data.map((service) => (
                <ServiceRow key={service.id} service={service} canManage={canManage} />
              ))}
            </SimpleTable>
          )
        }
      </QueryState>
    </div>
  );
}
