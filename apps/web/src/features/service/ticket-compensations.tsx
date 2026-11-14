'use client';

import {
  compensationTypeSchema,
  type Compensation,
  type CompensationType,
  type TicketDetail,
} from '@arza/contracts';
import { Badge, Button, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { HandCoins } from 'lucide-react';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { bogotaToday, formatPesos } from '../crm/labels';
import { RecordDialog } from '../organization/record-dialog';
import {
  ChoiceFields,
  decimal,
  DialogForm,
  Fields,
  optionsOf,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from '../projects/form-bits';
import { COMPENSATION_STATUSES, COMPENSATION_TONES, COMPENSATION_TYPES } from './labels';
import { useCompensations, useServiceAction } from './queries';

// Compensaciones técnicas al cliente del tiquete (B28, RE-SAC-001): las propone quien atiende y las
// decide otra persona con permiso de aprobar. La aprobada queda para Facturación (B31); mientras
// tanto se registra aquí cuándo se aplicó.

interface Props {
  readonly ticket: TicketDetail;
}

const VALUE_FIELD: Readonly<Record<CompensationType, string>> = {
  discount: 'amount',
  support_hours: 'hours',
  service_extension: 'days',
};

const VALUE_LABEL: Readonly<Record<CompensationType, string>> = {
  discount: 'Valor del descuento en pesos (sin puntos de miles)',
  support_hours: 'Horas de soporte sin costo',
  service_extension: 'Días de extensión del servicio',
};

interface Values {
  readonly type: string;
  readonly value: string;
  readonly reason: string;
}

const TYPE_SPEC: readonly ChoiceSpec<'type'>[] = [
  {
    key: 'type',
    field: 'type',
    id: 'compensacion-tipo',
    label: 'Tipo',
    options: optionsOf(COMPENSATION_TYPES),
  },
];

function textSpecs(type: CompensationType): readonly FieldSpec<'value' | 'reason'>[] {
  return [
    {
      key: 'value',
      field: VALUE_FIELD[type],
      id: 'compensacion-valor',
      label: VALUE_LABEL[type],
      inputMode: 'decimal',
    },
    {
      key: 'reason',
      field: 'reason',
      id: 'compensacion-motivo',
      label: 'Por qué se compensa',
      multiline: true,
    },
  ];
}

function bodyOf(values: Values): object {
  const type = compensationTypeSchema.parse(values.type);
  const value = values.value.trim().replace(',', '.');
  return {
    type,
    amount: type === 'discount' ? value : null,
    hours: type === 'support_hours' ? decimal(value) : null,
    days: type === 'service_extension' ? Number(value) : null,
    reason: values.reason.trim(),
  };
}

function problemsOf(values: Values): Record<string, string> {
  const type = compensationTypeSchema.parse(values.type);
  const found: Record<string, string> = {};
  if (!(decimal(values.value) > 0)) found[VALUE_FIELD[type]] = 'Escriba un valor mayor que cero.';
  if (values.reason.trim().length < 3) found['reason'] = 'Escriba el motivo.';
  return found;
}

function ProposeForm(props: Props & { readonly onDone: () => void }): JSX.Element {
  const api = useApiClient();
  const propose = useServiceAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/tickets/${props.ticket.id}/compensations`, { body, csrfToken });
  }, props.onDone);
  const form = useDialogForm<Values>(
    { type: 'discount', value: '', reason: '' },
    problemsOf,
    (values) => {
      propose.execute(bodyOf(values));
    },
  );
  const specs = textSpecs(compensationTypeSchema.parse(form.values.type));
  const change = (key: string, value: string): void => {
    form.set({ [key]: value });
  };
  return (
    <DialogForm
      problems={form.problems}
      fields={specs}
      action={propose}
      submitLabel="Proponer"
      onSubmit={form.submit}
    >
      <ChoiceFields
        specs={TYPE_SPEC}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
      <Fields specs={specs} values={form.values} problems={form.problems} onChange={change} />
    </DialogForm>
  );
}

function valueOf(item: Compensation): string {
  if (item.amount !== null) return formatPesos(item.amount);
  if (item.hours !== null) return `${String(item.hours).replace('.', ',')} h`;
  return `${String(item.days ?? 0)} días`;
}

interface Decision {
  readonly path: string;
  readonly label: string;
  readonly body: object;
}

/** Lo que se puede hacer con la compensación según su estado. */
function decisionsOf(item: Compensation): Decision[] {
  if (item.status === 'proposed') {
    return [
      { path: 'decide', label: 'Aprobar', body: { approve: true } },
      { path: 'decide', label: 'Rechazar', body: { approve: false } },
    ];
  }
  if (item.status === 'approved') {
    return [{ path: 'apply', label: 'Marcar aplicada hoy', body: { applied_on: bogotaToday() } }];
  }
  return [];
}

function DecideButtons(props: Props & { readonly item: Compensation }): JSX.Element {
  const api = useApiClient();
  const base = `/v1/tickets/${props.ticket.id}/compensations/${props.item.id}/actions`;
  const act = useServiceAction<Decision>(async (decision, csrfToken) => {
    const options = { body: decision.body, version: props.item.version, csrfToken };
    await api.post(`${base}/${decision.path}`, options);
  });
  return (
    <div className="flex flex-wrap gap-2">
      {decisionsOf(props.item).map((decision) => (
        <Button
          key={decision.label}
          type="button"
          size="sm"
          variant="outline"
          disabled={act.pending}
          onClick={() => {
            act.execute(decision);
          }}
        >
          {decision.label}
        </Button>
      ))}
      {act.error === null ? null : <FormError error={act.error} />}
      {act.dialog}
    </div>
  );
}

function Row(props: Props & { readonly item: Compensation }): JSX.Element {
  const { item, ticket } = props;
  return (
    <TableRow>
      <TableCell>{COMPENSATION_TYPES[item.type]}</TableCell>
      <TableCell className="tabular-nums">{valueOf(item)}</TableCell>
      <TableCell>
        {item.reason}
        <p className="text-xs text-muted-foreground">
          Propuso {item.proposed_by?.name ?? '—'} · {formatDateTime(item.created_at)}
        </p>
      </TableCell>
      <TableCell>
        <Badge tone={COMPENSATION_TONES[item.status]}>{COMPENSATION_STATUSES[item.status]}</Badge>
        {item.applied_on === null ? null : (
          <p className="text-xs">Aplicada el {formatDate(item.applied_on)}</p>
        )}
      </TableCell>
      <TableCell>
        {ticket.can.decide_compensation ? <DecideButtons ticket={ticket} item={item} /> : null}
      </TableCell>
    </TableRow>
  );
}

export function TicketCompensations({ ticket }: Props): JSX.Element {
  const list = useCompensations(ticket.id, true);
  return (
    <div className="flex flex-col gap-4">
      {ticket.can.propose_compensation ? (
        <div>
          <RecordDialog
            triggerLabel="Proponer una compensación"
            title="Nueva compensación"
            description="Registro RE-SAC-001. Otra persona con permiso la aprueba o la rechaza."
          >
            {(close) => <ProposeForm ticket={ticket} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <QueryState query={list} loadingLabel="Cargando las compensaciones">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<HandCoins />}
              title="Sin compensaciones"
              description="Si se incumplió el acuerdo, proponga aquí cómo se compensa al cliente."
            />
          ) : (
            <SimpleTable
              caption="Compensaciones del tiquete (RE-SAC-001)"
              scrollLabel="Compensaciones; desplácese a los lados para ver todas las columnas"
              headers={['Tipo', 'Valor', 'Motivo', 'Estado', 'Acción']}
            >
              {data.data.map((item) => (
                <Row key={item.id} ticket={ticket} item={item} />
              ))}
            </SimpleTable>
          )
        }
      </QueryState>
    </div>
  );
}
