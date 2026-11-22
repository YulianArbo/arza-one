'use client';

import {
  AUDIT_PROGRAM_STATUSES,
  AUDIT_STATUSES,
  FINDING_TYPES,
  auditFindingListResponseSchema,
  auditProgramListResponseSchema,
  planAuditSchema,
  qmsCodeResponseSchema,
  qmsCreatedResponseSchema,
  saveAuditProgramSchema,
  type AuditFinding,
  type AuditProgram,
  type AuditSummary,
} from '@arza/contracts';
import { Badge, PageHeader } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrActionButton, HrDialogForm, HrList, HrSection, orNull } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { usePermissions } from '../session/permissions';
import {
  QMS_REFRESH,
  bogotaToday,
  useQmsPeople,
  useQmsProcesses,
  useQmsQuery,
} from './quality-queries';

// Programa anual y auditorías internas (B39; PL-SGC-001 y PL-SGC-002). Calidad arma y publica el
// programa y asigna cada auditoría a un colaborador que no sea del proceso auditado (decisiones 1,
// 2 y 4); el auditor la ejecuta desde su detalle o desde Mi espacio.

export const AUDIT_TONE = {
  planned: 'info',
  in_progress: 'warning',
  reported: 'success',
  closed: 'neutral',
  cancelled: 'neutral',
} as const;

function programFields(program?: AuditProgram): HrField[] {
  const year = Number(bogotaToday().slice(0, 4)) + 1;
  return [
    { key: 'year', label: 'Año', type: 'number', value: String(program?.year ?? year) },
    { key: 'objectives', label: 'Objetivos', value: program?.objectives ?? '' },
    { key: 'scope', label: 'Alcance', value: program?.scope ?? '' },
    { key: 'criteria', label: 'Criterios', value: program?.criteria ?? '' },
  ];
}

function ProgramForm({ program }: { readonly program?: AuditProgram }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const editing = program !== undefined;
  return (
    <HrDialogForm
      allowed={canAll('qms.audit.plan')}
      label={editing ? 'Editar programa' : 'Crear programa anual'}
      title={editing ? `Editar el programa ${String(program.year)}` : 'Crear el programa anual'}
      description="Un programa por año: objetivos, alcance y criterios de las auditorías."
      fields={programFields(program)}
      schema={saveAuditProgramSchema}
      prepare={(values) => ({ ...values, year: Number(values['year']) })}
      run={(body, csrfToken) =>
        editing
          ? api.patch(`/v1/qms/audit-programs/${program.id}`, {
              body,
              csrfToken,
              version: program.version,
            })
          : api.post('/v1/qms/audit-programs', {
              body,
              csrfToken,
              schema: qmsCreatedResponseSchema,
            })
      }
      submitLabel="Guardar"
      refresh={QMS_REFRESH}
    />
  );
}

function PlanAudit({ program }: { readonly program: AuditProgram }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const allowed = canAll('qms.audit.plan');
  const processes = useQmsProcesses(allowed);
  const people = useQmsPeople(allowed);
  return (
    <HrDialogForm
      allowed={allowed}
      label="Programar auditoría"
      title={`Programar una auditoría del ${String(program.year)}`}
      description="El auditor no puede ser del proceso auditado ni dirigirlo."
      fields={[
        { key: 'process_id', label: 'Proceso auditado', options: processes },
        { key: 'auditor_id', label: 'Auditor', options: people },
        { key: 'planned_on', label: 'Fecha programada', type: 'date' },
        { key: 'objective', label: 'Objetivo' },
        { key: 'criteria', label: 'Criterios (opcional)' },
      ]}
      schema={planAuditSchema}
      prepare={(values) => ({
        ...values,
        program_id: program.id,
        criteria: orNull(values['criteria']),
      })}
      run={(body, csrfToken) =>
        api.post('/v1/qms/audits', { body, csrfToken, schema: qmsCodeResponseSchema })
      }
      submitLabel="Programar"
      refresh={QMS_REFRESH}
    />
  );
}

function PublishProgram({ program }: { readonly program: AuditProgram }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  if (!canAll('qms.audit.plan') || program.status !== 'draft') return null;
  return (
    <HrActionButton
      label="Publicar"
      pendingLabel="Publicando…"
      ariaLabel={`Publicar el programa ${String(program.year)}`}
      run={(csrfToken) =>
        api.post(`/v1/qms/audit-programs/${program.id}/actions/publish`, {
          body: {},
          csrfToken,
          version: program.version,
        })
      }
      refresh={QMS_REFRESH}
    />
  );
}

export function AuditRow({ audit }: { readonly audit: AuditSummary }): JSX.Element {
  return (
    <>
      <span className="flex flex-col gap-1">
        <span>
          <strong>{audit.code}</strong> · {audit.process.name}
        </span>
        <span className="text-muted-foreground">
          Auditor: {audit.auditor.name} · programada el {formatDate(audit.planned_on)} ·{' '}
          {String(audit.findings)} hallazgos
        </span>
        <Badge tone={AUDIT_TONE[audit.status]}>{AUDIT_STATUSES[audit.status]}</Badge>
      </span>
      <Link className="text-sm underline" href={`/app/calidad/auditorias/${audit.id}`}>
        Abrir {audit.code}
      </Link>
    </>
  );
}

function ProgramCard({ program }: { readonly program: AuditProgram }): JSX.Element {
  return (
    <HrSection id={`programa-${String(program.year)}`} title={`Programa ${String(program.year)}`}>
      <p className="text-muted-foreground">
        {AUDIT_PROGRAM_STATUSES[program.status]} · {program.objectives} · Alcance: {program.scope} ·
        Criterios: {program.criteria}
      </p>
      <div className="flex flex-wrap gap-3">
        <PlanAudit program={program} />
        <PublishProgram program={program} />
        <ProgramForm program={program} />
      </div>
      <HrList
        items={program.audits}
        empty="El programa aún no tiene auditorías."
        keyOf={(item) => item.id}
        render={(item) => <AuditRow audit={item} />}
      />
    </HrSection>
  );
}

function FindingRow({ finding }: { readonly finding: AuditFinding }): JSX.Element {
  const follow = finding.nonconformity ?? finding.action;
  return (
    <span className="flex flex-col gap-1">
      <span>
        <strong>{finding.audit.code}</strong> · {FINDING_TYPES[finding.type]} ·{' '}
        {finding.process.name}
      </span>
      <span>
        {finding.requirement}: {finding.description}
      </span>
      <span className="text-muted-foreground">
        {follow === null ? 'Sin seguimiento aún' : `Seguimiento: ${follow.code}`}
      </span>
    </span>
  );
}

function Findings(): JSX.Element {
  const query = useQmsQuery('/v1/qms/findings', auditFindingListResponseSchema);
  return (
    <HrSection id="hallazgos" title="Hallazgos de las auditorías">
      <QueryState query={query} loadingLabel="Cargando los hallazgos">
        {({ data }) => (
          <HrList
            items={data}
            empty="Aún no hay hallazgos."
            keyOf={(item) => item.id}
            render={(item) => <FindingRow finding={item} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

export function QualityAudits(): JSX.Element {
  const query = useQmsQuery('/v1/qms/audit-programs', auditProgramListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Programa y auditorías"
        description="PL-SGC-001 y PL-SGC-002. Un auditor no audita su propio proceso."
      />
      <div>
        <ProgramForm />
      </div>
      <QueryState query={query} loadingLabel="Cargando los programas">
        {({ data }) =>
          data.length === 0 ? (
            <p className="text-muted-foreground">Aún no hay programas de auditoría.</p>
          ) : (
            <div className="flex flex-col gap-8">
              {data.map((program) => (
                <ProgramCard key={program.id} program={program} />
              ))}
            </div>
          )
        }
      </QueryState>
      <Findings />
    </div>
  );
}
