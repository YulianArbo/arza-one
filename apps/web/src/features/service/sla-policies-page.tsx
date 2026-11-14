'use client';

import { slaCalendarSchema, type SlaPolicy } from '@arza/contracts';
import { SimpleTable, TableCell, TableRow } from '@arza/ui';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
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
import { SLA_CALENDARS, TICKET_PRIORITIES } from './labels';
import { useServiceAction, useSlaPolicies } from './queries';
import { BackLink, hoursText } from './service-bits';

// Acuerdos de tiempo por prioridad (B28, decisión 2). Servicio al cliente los cambia; valen para
// los tiquetes que se registren o cambien de prioridad desde entonces.

const TEXTS: readonly FieldSpec<'response' | 'resolution'>[] = [
  {
    key: 'response',
    field: 'first_response_hours',
    id: 'acuerdo-respuesta',
    label: 'Horas para la primera respuesta',
    inputMode: 'decimal',
  },
  {
    key: 'resolution',
    field: 'resolution_hours',
    id: 'acuerdo-solucion',
    label: 'Horas para la solución',
    inputMode: 'decimal',
  },
];

const CHOICES: readonly ChoiceSpec<'calendar'>[] = [
  {
    key: 'calendar',
    field: 'calendar',
    id: 'acuerdo-calendario',
    label: 'Cómo cuenta el reloj',
    options: optionsOf(SLA_CALENDARS),
  },
];

interface Values {
  readonly response: string;
  readonly resolution: string;
  readonly calendar: string;
}

function problemsOf(values: Values): Record<string, string> {
  const found: Record<string, string> = {};
  const response = decimal(values.response);
  const resolution = decimal(values.resolution);
  if (!(response > 0)) found['first_response_hours'] = 'Escriba un plazo mayor que cero.';
  if (!(resolution > 0)) found['resolution_hours'] = 'Escriba un plazo mayor que cero.';
  else if (resolution < response)
    found['resolution_hours'] = 'No puede ser menor que la respuesta.';
  return found;
}

function bodyOf(values: Values): object {
  return {
    first_response_hours: decimal(values.response),
    resolution_hours: decimal(values.resolution),
    calendar: slaCalendarSchema.parse(values.calendar),
  };
}

function usePolicyForm(policy: SlaPolicy, onDone: () => void) {
  const api = useApiClient();
  const save = useServiceAction<object>(async (body, csrfToken) => {
    await api.put(`/v1/sla-policies/${policy.id}`, { body, version: policy.version, csrfToken });
  }, onDone);
  const initial: Values = {
    response: String(policy.first_response_hours),
    resolution: String(policy.resolution_hours),
    calendar: policy.calendar,
  };
  const form = useDialogForm(initial, problemsOf, (values) => {
    save.execute(bodyOf(values));
  });
  return { save, form };
}

function PolicyForm(props: { readonly policy: SlaPolicy; readonly onDone: () => void }) {
  const { save, form } = usePolicyForm(props.policy, props.onDone);
  const change = (key: string, value: string): void => {
    form.set({ [key]: value });
  };
  return (
    <DialogForm
      problems={form.problems}
      fields={TEXTS}
      action={save}
      submitLabel="Guardar"
      onSubmit={form.submit}
    >
      <Fields specs={TEXTS} values={form.values} problems={form.problems} onChange={change} />
      <ChoiceFields
        specs={CHOICES}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
    </DialogForm>
  );
}

function PolicyRow(props: { readonly policy: SlaPolicy; readonly canManage: boolean }) {
  const { policy } = props;
  const name = TICKET_PRIORITIES[policy.priority].toLowerCase();
  return (
    <TableRow>
      <TableCell>{TICKET_PRIORITIES[policy.priority]}</TableCell>
      <TableCell className="tabular-nums">{hoursText(policy.first_response_hours)}</TableCell>
      <TableCell className="tabular-nums">{hoursText(policy.resolution_hours)}</TableCell>
      <TableCell>{SLA_CALENDARS[policy.calendar]}</TableCell>
      <TableCell>
        {props.canManage ? (
          <RecordDialog
            triggerLabel="Cambiar"
            variant="outline"
            triggerAriaLabel={`Cambiar el acuerdo de prioridad ${name}`}
            title={`Acuerdo de prioridad ${name}`}
            description="Vale para los tiquetes que se registren o cambien de prioridad desde ahora."
          >
            {(close) => <PolicyForm policy={policy} onDone={close} />}
          </RecordDialog>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function SlaPoliciesPage(): JSX.Element {
  const policies = useSlaPolicies();
  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <PageHeader
        title="Acuerdos de tiempo"
        description="Plazos de primera respuesta y de solución por prioridad. Al 80 % del plazo de solución se avisa al responsable y al líder."
      />
      <QueryState query={policies} loadingLabel="Cargando los acuerdos">
        {(data) => (
          <SimpleTable
            caption="Acuerdos de tiempo por prioridad"
            scrollLabel="Acuerdos; desplácese a los lados para ver todas las columnas"
            headers={['Prioridad', 'Primera respuesta', 'Solución', 'Reloj', 'Acción']}
          >
            {data.data.map((policy) => (
              <PolicyRow key={policy.id} policy={policy} canManage={data.can_manage} />
            ))}
          </SimpleTable>
        )}
      </QueryState>
    </div>
  );
}
