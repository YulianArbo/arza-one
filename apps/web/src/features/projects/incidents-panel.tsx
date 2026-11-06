'use client';

import {
  incidentKindSchema,
  incidentSeveritySchema,
  type ProjectDetail,
  type ProjectIncident,
} from '@arza/contracts';
import { Badge, EmptyState, SimpleTable, TableCell, TableRow } from '@arza/ui';
import { Siren } from 'lucide-react';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import {
  CheckField,
  ChoiceFields,
  DialogForm,
  Fields,
  optionsOf,
  useDialogForm,
  type ChoiceSpec,
  type FieldSpec,
} from './form-bits';
import { INCIDENT_KINDS, INCIDENT_SEVERITIES, INCIDENT_STATUSES, SEVERITY_TONES } from './labels';
import { useIncidents, useProjectAction } from './queries';

// Incidentes críticos y de seguridad del proyecto (B27, FT-TEC-004, PR-TEC-004). El Líder técnico
// los registra y los resuelve con su causa raíz y sus acciones. Si se comprometieron datos
// personales, el Oficial de datos recibe el aviso con el plazo para reportar a la SIC.

interface Props {
  readonly project: ProjectDetail;
}

/** La hora local escrita en el formulario (AAAA-MM-DDTHH:MM) como instante con zona. */
function instant(local: string): string {
  return new Date(local).toISOString();
}

interface NewValues {
  readonly title: string;
  readonly kind: string;
  readonly severity: string;
  readonly description: string;
  readonly detectedAt: string;
  readonly personalData: boolean;
}

const NEW_TEXTS: readonly FieldSpec<'title' | 'description' | 'detectedAt'>[] = [
  { key: 'title', field: 'title', id: 'incidente-titulo', label: 'Título' },
  { key: 'description', field: 'description', id: 'incidente-descripcion', label: 'Qué pasó' },
  {
    key: 'detectedAt',
    field: 'detected_at',
    id: 'incidente-deteccion',
    label: 'Cuándo se detectó (fecha y hora)',
    type: 'datetime-local',
  },
];

const NEW_CHOICES: readonly ChoiceSpec<'kind' | 'severity'>[] = [
  {
    key: 'kind',
    field: 'kind',
    id: 'incidente-tipo',
    label: 'Tipo',
    options: optionsOf(INCIDENT_KINDS),
  },
  {
    key: 'severity',
    field: 'severity',
    id: 'incidente-gravedad',
    label: 'Gravedad',
    options: optionsOf(INCIDENT_SEVERITIES),
  },
];

function newProblems(values: NewValues): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.title.trim().length < 3) found['title'] = 'Escriba un título corto.';
  if (values.description.trim().length < 3) found['description'] = 'Describa qué pasó.';
  if (values.detectedAt === '') found['detected_at'] = 'Escriba la fecha y la hora.';
  return found;
}

function newBody(values: NewValues): object {
  return {
    title: values.title.trim(),
    kind: incidentKindSchema.parse(values.kind),
    severity: incidentSeveritySchema.parse(values.severity),
    description: values.description.trim(),
    detected_at: instant(values.detectedAt),
    personal_data: values.personalData,
  };
}

const NEW_EMPTY: NewValues = {
  title: '',
  kind: 'failure',
  severity: 'high',
  description: '',
  detectedAt: '',
  personalData: false,
};

function NewIncident(props: Props & { readonly onDone: () => void }): JSX.Element {
  const api = useApiClient();
  const report = useProjectAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/projects/${props.project.id}/incidents`, { body, csrfToken });
  }, props.onDone);
  const form = useDialogForm(NEW_EMPTY, newProblems, (values) => {
    report.execute(newBody(values));
  });
  const change = (key: string, value: string): void => {
    form.set({ [key]: value });
  };
  return (
    <DialogForm
      problems={form.problems}
      fields={NEW_TEXTS}
      action={report}
      submitLabel="Registrar el incidente"
      onSubmit={form.submit}
    >
      <Fields specs={NEW_TEXTS} values={form.values} problems={form.problems} onChange={change} />
      <ChoiceFields
        specs={NEW_CHOICES}
        values={form.values}
        problems={form.problems}
        onChange={change}
      />
      <CheckField
        id="incidente-datos"
        label="Se comprometieron datos personales"
        checked={form.values.personalData}
        onChange={(personalData) => {
          form.set({ personalData });
        }}
      />
    </DialogForm>
  );
}

interface ResolveValues {
  readonly resolvedAt: string;
  readonly rootCause: string;
  readonly actions: string;
}

const RESOLVE_TEXTS: readonly FieldSpec<keyof ResolveValues>[] = [
  {
    key: 'resolvedAt',
    field: 'resolved_at',
    id: 'solucion-fecha',
    label: 'Cuándo se resolvió (fecha y hora)',
    type: 'datetime-local',
  },
  { key: 'rootCause', field: 'root_cause', id: 'solucion-causa', label: 'Causa raíz' },
  {
    key: 'actions',
    field: 'actions',
    id: 'solucion-acciones',
    label: 'Qué se hizo y qué se hará para que no se repita',
  },
];

function resolveProblems(values: ResolveValues): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.resolvedAt === '') found['resolved_at'] = 'Escriba la fecha y la hora.';
  if (values.rootCause.trim().length < 3) found['root_cause'] = 'Escriba la causa raíz.';
  if (values.actions.trim().length < 3) found['actions'] = 'Escriba qué se hizo.';
  return found;
}

function ResolveForm(
  props: Props & { readonly incident: ProjectIncident; readonly onDone: () => void },
) {
  const api = useApiClient();
  const path = `/v1/projects/${props.project.id}/incidents/${props.incident.id}/actions/resolve`;
  const resolve = useProjectAction<object>(async (body, csrfToken) => {
    await api.post(path, { body, version: props.incident.version, csrfToken });
  }, props.onDone);
  const form = useDialogForm(
    { resolvedAt: '', rootCause: '', actions: '' },
    resolveProblems,
    (values) => {
      resolve.execute({
        resolved_at: instant(values.resolvedAt),
        root_cause: values.rootCause.trim(),
        actions: values.actions.trim(),
      });
    },
  );
  return (
    <DialogForm
      problems={form.problems}
      fields={RESOLVE_TEXTS}
      action={resolve}
      submitLabel="Resolver"
      onSubmit={form.submit}
    >
      <Fields
        specs={RESOLVE_TEXTS}
        values={form.values}
        problems={form.problems}
        onChange={(key, value) => {
          form.set({ [key]: value });
        }}
      />
    </DialogForm>
  );
}

function IncidentRow(props: Props & { readonly incident: ProjectIncident }): JSX.Element {
  const { incident, project } = props;
  const canResolve =
    project.can.manage_incidents && incident.status === 'open' && project.status !== 'closed';
  return (
    <TableRow>
      <TableCell>
        {incident.code} · {incident.title}
        {incident.personal_data ? <p className="text-xs">Con datos personales</p> : null}
      </TableCell>
      <TableCell>{INCIDENT_KINDS[incident.kind]}</TableCell>
      <TableCell>
        <Badge tone={SEVERITY_TONES[incident.severity]}>
          {INCIDENT_SEVERITIES[incident.severity]}
        </Badge>
      </TableCell>
      <TableCell>{formatDateTime(incident.detected_at)}</TableCell>
      <TableCell>
        {INCIDENT_STATUSES[incident.status]}
        {incident.root_cause === null ? null : (
          <p className="text-xs text-muted-foreground">Causa: {incident.root_cause}</p>
        )}
      </TableCell>
      <TableCell>
        {canResolve ? (
          <RecordDialog
            triggerLabel="Resolver"
            variant="outline"
            title={`Resolver ${incident.code}`}
            description="Con la causa raíz y las acciones para que no se repita."
          >
            {(close) => <ResolveForm project={project} incident={incident} onDone={close} />}
          </RecordDialog>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

export function IncidentsPanel({ project }: Props): JSX.Element {
  const incidents = useIncidents(project.id);
  return (
    <div className="flex flex-col gap-4">
      {project.can.manage_incidents && project.status !== 'closed' ? (
        <div>
          <RecordDialog
            triggerLabel="Registrar un incidente"
            title="Nuevo incidente"
            description="Registro FT-TEC-004. Con datos personales, se avisa al Oficial de datos."
          >
            {(close) => <NewIncident project={project} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <QueryState query={incidents} loadingLabel="Cargando los incidentes">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<Siren />}
              title="Sin incidentes"
              description="Los incidentes críticos y de seguridad del proyecto se registran aquí."
            />
          ) : (
            <SimpleTable
              caption="Incidentes del proyecto (FT-TEC-004)"
              scrollLabel="Incidentes; desplácese a los lados para ver todas las columnas"
              headers={['Incidente', 'Tipo', 'Gravedad', 'Detectado', 'Estado', 'Acción']}
            >
              {data.data.map((incident) => (
                <IncidentRow key={incident.id} project={project} incident={incident} />
              ))}
            </SimpleTable>
          )
        }
      </QueryState>
    </div>
  );
}
