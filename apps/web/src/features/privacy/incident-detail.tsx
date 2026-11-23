'use client';

import {
  canPrivacyIncidentStep,
  PRIVACY_INCIDENT_STATUSES,
  type PrivacyIncident,
} from '@arza/contracts';
import { Alert, AlertDescription, Badge, Card, CardContent, CardHeader, CardTitle } from '@arza/ui';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { bogotaToday } from '../crm/labels';
import { FactsCard, type Fact } from '../crm/crm-facts';
import { RecordDialog } from '../organization/record-dialog';
import { DialogForm, Fields, useDialogForm, type FieldSpec } from '../projects/form-bits';
import { DATA_CATEGORY_TEXT, INCIDENT_STATUS_TONES } from './request-labels';
import { useIncidentStep, usePrivacyIncident } from './request-queries';

// Ficha del incidente con datos personales (B42, decisión 9): su plazo para la SIC, la contención,
// la bitácora de medidas, el reporte, el aviso a los titulares y el cierre.

interface Props {
  readonly incident: PrivacyIncident;
}

type Key = 'a' | 'b';

interface StepSpec {
  readonly label: string;
  readonly title: string;
  readonly path: string;
  readonly specs: readonly FieldSpec<Key>[];
  readonly body: (values: Record<Key, string>) => object;
  readonly required: readonly Key[];
}

function StepForm(props: Props & { readonly spec: StepSpec; readonly onDone: () => void }) {
  const step = useIncidentStep(props.incident, props.spec.path, props.onDone);
  const form = useDialogForm<Record<Key, string>>(
    { a: '', b: bogotaToday() },
    (values) => {
      const missing = props.spec.required.find((key) => values[key].trim().length < 3);
      const spec = props.spec.specs.find((item) => item.key === missing);
      return spec === undefined ? {} : { [spec.field]: 'Complete este dato.' };
    },
    (values) => {
      step.execute(props.spec.body(values));
    },
  );
  const fields = props.spec.specs.map((spec) => ({
    field: spec.field,
    id: spec.id,
    label: spec.label,
  }));
  return (
    <DialogForm
      problems={form.problems}
      fields={fields}
      action={step}
      submitLabel="Guardar"
      onSubmit={form.submit}
    >
      <Fields
        specs={props.spec.specs}
        values={form.values}
        problems={form.problems}
        onChange={(key, value) => {
          form.set({ [key]: value });
        }}
      />
    </DialogForm>
  );
}

const NOTE = (field: string, label: string): FieldSpec<Key> => ({
  key: 'a',
  field,
  id: `incidente-${field}`,
  label,
  multiline: true,
});
const DAY = (field: string, label: string): FieldSpec<Key> => ({
  key: 'b',
  field,
  id: `incidente-${field}`,
  label,
  type: 'date',
});

type IncidentAction = Parameters<typeof canPrivacyIncidentStep>[0];

/** Los pasos fijos: cuándo se muestran y qué piden. */
const FIXED_STEPS: readonly (StepSpec & { readonly action: IncidentAction })[] = [
  {
    action: 'contain',
    label: 'Registrar la contención',
    title: 'Contención',
    path: 'actions/contain',
    specs: [NOTE('note', 'Qué se hizo para contenerlo')],
    body: (v) => ({ note: v.a }),
    required: ['a'],
  },
  {
    action: 'add_measure',
    label: 'Agregar una medida',
    title: 'Medida',
    path: 'measures',
    specs: [NOTE('description', 'La medida'), DAY('taken_on', 'Día en que se tomó')],
    body: (v) => ({ description: v.a, taken_on: v.b }),
    required: ['a', 'b'],
  },
  {
    action: 'report',
    label: 'Registrar el reporte a la SIC',
    title: 'Reporte a la SIC',
    path: 'actions/report',
    specs: [
      { key: 'a', field: 'reference', id: 'incidente-radicado', label: 'Radicado de la SIC' },
      DAY('reported_on', 'Día del reporte'),
    ],
    body: (v) => ({ reference: v.a, reported_on: v.b }),
    required: ['a', 'b'],
  },
  {
    action: 'notify_holders',
    label: 'Registrar el aviso a los titulares',
    title: 'Aviso a los titulares',
    path: 'actions/notify-holders',
    specs: [NOTE('note', 'Cómo y a quiénes se informó'), DAY('notified_on', 'Día del aviso')],
    body: (v) => ({ note: v.a, notified_on: v.b }),
    required: ['a', 'b'],
  },
];

/** El cierre pide el motivo solo si no se reportó a la SIC (decisión 9). */
function closeStep(incident: PrivacyIncident): StepSpec {
  const unreported = incident.reported_on === null;
  return {
    label: 'Cerrar el incidente',
    title: 'Cierre',
    path: 'actions/close',
    specs: unreported ? [NOTE('not_reportable_reason', 'Por qué no se reporta a la SIC')] : [],
    body: (v) => ({ not_reportable_reason: unreported ? v.a : null }),
    required: unreported ? ['a'] : [],
  };
}

function stepsOf(incident: PrivacyIncident): StepSpec[] {
  const shown = FIXED_STEPS.filter(
    (step) =>
      canPrivacyIncidentStep(step.action, incident.status) &&
      (step.action !== 'notify_holders' || incident.holders_notified_on === null),
  );
  const close = canPrivacyIncidentStep('close', incident.status) ? [closeStep(incident)] : [];
  return [...shown, ...close];
}

function facts(incident: PrivacyIncident): Fact[] {
  return [
    ['Detectado', formatDateTime(incident.detected_at)],
    ['Titulares afectados', String(incident.affected_count)],
    [
      'Tipos de datos',
      incident.data_categories.map((item) => DATA_CATEGORY_TEXT[item] ?? item).join(', '),
    ],
    ['Fecha límite SIC', formatDate(incident.sic_due_on)],
    [
      'Reporte a la SIC',
      incident.reported_on === null
        ? 'Sin reportar'
        : `${formatDate(incident.reported_on)} · ${incident.sic_reference ?? ''}`,
    ],
    ['Contención', incident.containment_note ?? 'Sin registrar'],
    [
      'Aviso a titulares',
      incident.holders_notice === null
        ? 'Sin registrar'
        : `${formatDate(incident.holders_notified_on)}: ${incident.holders_notice}`,
    ],
    ['Incidente en Proyectos', incident.project_incident_ref ?? '—'],
    ['Motivo para no reportar', incident.not_reportable_reason ?? '—'],
    ['Descripción', incident.description],
  ];
}

function Measures({ incident }: Props): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bitácora de medidas</CardTitle>
      </CardHeader>
      <CardContent>
        {incident.measures.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay medidas registradas.</p>
        ) : (
          <ol className="flex flex-col gap-2 text-sm" aria-label="Medidas tomadas">
            {incident.measures.map((measure) => (
              <li key={measure.id} className="border-l-2 pl-3">
                <p>{measure.description}</p>
                <p className="text-muted-foreground">
                  {formatDate(measure.taken_on)} · {measure.recorded_by ?? 'El sistema'}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({ incident }: Props): JSX.Element {
  return (
    <>
      <PageHeader title={incident.code} description={incident.title} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={INCIDENT_STATUS_TONES[incident.status]}>
          {PRIVACY_INCIDENT_STATUSES[incident.status]}
        </Badge>
        {incident.sensitive ? <Badge tone="warning">Datos sensibles</Badge> : null}
      </div>
      {incident.overdue ? (
        <Alert tone="warning">
          <AlertDescription>
            Pasó la fecha límite ({formatDate(incident.sic_due_on)}) sin reporte a la SIC.
          </AlertDescription>
        </Alert>
      ) : null}
      <div
        className="flex flex-wrap items-start gap-2"
        role="group"
        aria-label="Acciones del incidente"
      >
        {stepsOf(incident).map((spec) => (
          <RecordDialog
            key={spec.label}
            triggerLabel={spec.label}
            variant="outline"
            title={spec.title}
            description={`${incident.code} · ${incident.title}`}
          >
            {(close) => <StepForm incident={incident} spec={spec} onDone={close} />}
          </RecordDialog>
        ))}
      </div>
      <FactsCard title="El incidente" facts={facts(incident)} />
      <Measures incident={incident} />
    </>
  );
}

export function IncidentDetail({ id }: { readonly id: string }): JSX.Element {
  const incident = usePrivacyIncident(id);
  return (
    <div className="flex flex-col gap-4">
      <QueryState query={incident} loadingLabel="Cargando el incidente">
        {(found) => <Detail incident={found} />}
      </QueryState>
    </div>
  );
}
