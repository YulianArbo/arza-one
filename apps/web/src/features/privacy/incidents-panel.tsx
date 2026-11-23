'use client';

import { PRIVACY_INCIDENT_STATUSES, type PrivacyIncidentSummary } from '@arza/contracts';
import { Badge, EmptyState, SelectField, SimpleTable, TableCell, TableRow } from '@arza/ui';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { optionsOf } from '../projects/form-bits';
import { IncidentForm } from './incident-form';
import { B42_PATHS, INCIDENT_STATUS_TONES } from './request-labels';
import { usePrivacyIncidents } from './request-queries';
import { RegisterButton } from './requests-panel';

// Privacidad › Incidentes (B42; numeral 15.7): los incidentes con datos personales, su fecha límite
// para reportarlos a la SIC y el registro en CSV.

const STATUS_OPTIONS = [{ value: '', label: 'Todos' }, ...optionsOf(PRIVACY_INCIDENT_STATUSES)];
const HEADERS = ['Código', 'Incidente', 'Detectado', 'Afectados', 'Reporte a la SIC', 'Estado'];

function SicCell({ incident }: { readonly incident: PrivacyIncidentSummary }): JSX.Element {
  if (incident.reported_on !== null)
    return <span>Reportado el {formatDate(incident.reported_on)}</span>;
  const text = `Hasta el ${formatDate(incident.sic_due_on)}`;
  return incident.overdue ? <Badge tone="destructive">Vencido: {text}</Badge> : <span>{text}</span>;
}

function IncidentRow({ incident }: { readonly incident: PrivacyIncidentSummary }): JSX.Element {
  return (
    <TableRow>
      <TableCell>
        <Link
          href={B42_PATHS.incident(incident.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {incident.code}
        </Link>
      </TableCell>
      <TableCell>
        {incident.title}
        {incident.sensitive ? <Badge tone="warning">Datos sensibles</Badge> : null}
      </TableCell>
      <TableCell>{formatDateTime(incident.detected_at)}</TableCell>
      <TableCell>{incident.affected_count}</TableCell>
      <TableCell>
        <SicCell incident={incident} />
      </TableCell>
      <TableCell>
        <Badge tone={INCIDENT_STATUS_TONES[incident.status]}>
          {PRIVACY_INCIDENT_STATUSES[incident.status]}
        </Badge>
      </TableCell>
    </TableRow>
  );
}

function IncidentTable({ data }: { readonly data: readonly PrivacyIncidentSummary[] }) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="No hay incidentes"
        description="Registre aquí todo incidente de seguridad que comprometa datos personales."
      />
    );
  }
  return (
    <SimpleTable
      caption="Incidentes con datos personales, los más recientes primero"
      headers={HEADERS}
    >
      {data.map((incident) => (
        <IncidentRow key={incident.id} incident={incident} />
      ))}
    </SimpleTable>
  );
}

export function IncidentsPanel(): JSX.Element {
  const [status, setStatus] = useState('');
  const incidents = usePrivacyIncidents(status);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-xs">
          <SelectField
            id="incidentes-estado"
            label="Estado"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
            }}
          />
        </div>
        <RecordDialog
          triggerLabel="Registrar incidente"
          title="Registrar un incidente"
          description="Desde la detección corren 15 días hábiles para reportarlo a la SIC."
        >
          {() => <IncidentForm />}
        </RecordDialog>
        <RegisterButton path="/v1/privacy-incidents/export" label="Descargar el registro (CSV)" />
      </div>
      <QueryState query={incidents} loadingLabel="Cargando los incidentes">
        {(page) => <IncidentTable data={page.data} />}
      </QueryState>
    </div>
  );
}
