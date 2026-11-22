'use client';

import {
  AUDIT_STATUSES,
  CHECKLIST_RESULTS,
  FINDING_TYPES,
  auditDetailResponseSchema,
  type Audit,
  type AuditFinding,
} from '@arza/contracts';
import { Badge, PageHeader, SimpleTable, TableCell, TableRow } from '@arza/ui';
import type { JSX } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrList, HrSection } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import {
  AddFinding,
  CancelAudit,
  ChecklistItemForm,
  CloseAudit,
  FindingAction,
  ReportAudit,
  ReportPdf,
  StartAudit,
} from './audit-steps';
import { AUDIT_TONE } from './quality-audits';
import { useQmsQuery } from './quality-queries';

// Detalle de una auditoría (B39): sus datos, la lista de chequeo (RE-SGC-003), los hallazgos y el
// informe (RE-SGC-004). Quien lee Calidad la abre desde el programa; el auditor, desde Mi espacio.

function Facts({ audit }: { readonly audit: Audit }): JSX.Element {
  const rows: readonly (readonly [string, string])[] = [
    ['Proceso auditado', audit.process.name],
    ['Auditor', audit.auditor.name],
    ['Programada', formatDate(audit.planned_on)],
    ['Iniciada', audit.started_on === null ? '—' : formatDate(audit.started_on)],
    ['Informe', audit.reported_on === null ? '—' : formatDate(audit.reported_on)],
    ['Objetivo', audit.objective],
    ['Criterios', audit.criteria ?? '—'],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Checklist({ audit }: { readonly audit: Audit }): JSX.Element {
  return (
    <HrSection id="lista-chequeo" title="Lista de chequeo">
      <div>
        <ChecklistItemForm audit={audit} />
      </div>
      {audit.checklist.length === 0 ? (
        <p className="text-muted-foreground">La lista de chequeo aún no tiene preguntas.</p>
      ) : (
        <SimpleTable
          headers={['Requisito', 'Pregunta', 'Resultado', 'Evidencia', '']}
          scrollLabel="Lista de chequeo"
        >
          {audit.checklist.map((item, index) => (
            <TableRow key={`${item.requirement}-${String(index)}`}>
              <TableCell>{item.requirement}</TableCell>
              <TableCell>{item.question}</TableCell>
              <TableCell>{CHECKLIST_RESULTS[item.result]}</TableCell>
              <TableCell>{item.evidence ?? '—'}</TableCell>
              <TableCell>
                <ChecklistItemForm audit={audit} index={index} />
              </TableCell>
            </TableRow>
          ))}
        </SimpleTable>
      )}
    </HrSection>
  );
}

function FindingRow(props: { readonly audit: Audit; readonly finding: AuditFinding }): JSX.Element {
  const { finding } = props;
  const follow = finding.nonconformity ?? finding.action;
  return (
    <>
      <span className="flex flex-col gap-1">
        <span>
          <strong>{FINDING_TYPES[finding.type]}</strong> · {finding.requirement}
        </span>
        <span>{finding.description}</span>
        <span className="text-muted-foreground">Evidencia: {finding.evidence}</span>
        {follow === null ? null : <span>Seguimiento: {follow.code}</span>}
      </span>
      <FindingAction audit={props.audit} finding={finding} />
    </>
  );
}

function AuditButtons(props: { readonly audit: Audit; readonly mine: boolean }): JSX.Element {
  return (
    <div className="flex flex-wrap gap-3">
      <StartAudit audit={props.audit} />
      <ReportAudit audit={props.audit} />
      <CloseAudit audit={props.audit} />
      <CancelAudit audit={props.audit} />
      <ReportPdf audit={props.audit} mine={props.mine} />
    </div>
  );
}

function Detail(props: {
  readonly audit: Audit;
  readonly findings: readonly AuditFinding[];
  readonly mine: boolean;
}): JSX.Element {
  const { audit } = props;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={`Auditoría ${audit.code}`} description={audit.objective} />
      <Badge tone={AUDIT_TONE[audit.status]}>{AUDIT_STATUSES[audit.status]}</Badge>
      <Facts audit={audit} />
      <AuditButtons audit={audit} mine={props.mine} />
      {audit.cancel_reason === null ? null : (
        <p className="text-muted-foreground">Cancelada: {audit.cancel_reason}</p>
      )}
      <Checklist audit={audit} />
      <HrSection id="hallazgos" title="Hallazgos">
        <div>
          <AddFinding audit={audit} />
        </div>
        <HrList
          items={props.findings}
          empty="La auditoría aún no tiene hallazgos."
          keyOf={(item) => item.id}
          render={(item) => <FindingRow audit={audit} finding={item} />}
        />
      </HrSection>
      {audit.conclusions === null ? null : (
        <HrSection id="conclusiones" title="Conclusiones">
          <p>{audit.conclusions}</p>
        </HrSection>
      )}
    </div>
  );
}

export function QualityAuditDetail({ id }: { readonly id: string }): JSX.Element {
  const { canAll } = usePermissions();
  const mine = !canAll('qms.read');
  const path = mine ? `/v1/qms/my/audits/${id}` : `/v1/qms/audits/${id}`;
  const query = useQmsQuery(path, auditDetailResponseSchema);
  return (
    <QueryState query={query} loadingLabel="Cargando la auditoría">
      {(data) => <Detail audit={data.audit} findings={data.findings} mine={mine} />}
    </QueryState>
  );
}
