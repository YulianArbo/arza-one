'use client';

import {
  CHECKLIST_RESULTS,
  FINDING_TYPES,
  addFindingSchema,
  cancelAuditSchema,
  downloadLinkResponseSchema,
  findingActionSchema,
  qmsCodeResponseSchema,
  qmsCreatedResponseSchema,
  reportAuditSchema,
  saveChecklistSchema,
  startAuditSchema,
  type Audit,
  type AuditChecklistItem,
  type AuditFinding,
} from '@arza/contracts';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { HrActionButton, HrDialogForm, optionsOf, orNull } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { usePermissions } from '../session/permissions';
import { QMS_REFRESH, bogotaToday, useQmsPeople } from './quality-queries';

// Los pasos de una auditoría (B39): el auditor la inicia, diligencia la lista de chequeo
// (RE-SGC-003), registra hallazgos y emite el informe (RE-SGC-004); Calidad la cierra o la cancela
// y convierte observaciones y oportunidades en acciones de mejora (decisión 3).

interface AuditProps {
  readonly audit: Audit;
}

export function StartAudit({ audit }: AuditProps): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  return (
    <HrDialogForm
      allowed={can('qms.audit.execute') && audit.status === 'planned'}
      label="Iniciar auditoría"
      title={`Iniciar ${audit.code}`}
      description="Desde hoy podrá diligenciar la lista de chequeo y registrar hallazgos."
      fields={[{ key: 'started_on', label: 'Fecha de inicio', type: 'date', value: bogotaToday() }]}
      schema={startAuditSchema}
      run={(body, csrfToken) =>
        api.post(`/v1/qms/audits/${audit.id}/actions/start`, {
          body,
          csrfToken,
          version: audit.version,
        })
      }
      submitLabel="Iniciar"
      refresh={QMS_REFRESH}
    />
  );
}

function checklistFields(current: AuditChecklistItem | undefined): HrField[] {
  return [
    { key: 'requirement', label: 'Requisito o numeral', value: current?.requirement ?? '' },
    { key: 'question', label: 'Pregunta', value: current?.question ?? '' },
    {
      key: 'result',
      label: 'Resultado',
      options: optionsOf(CHECKLIST_RESULTS),
      value: current?.result ?? 'not_evaluated',
    },
    { key: 'evidence', label: 'Evidencia (opcional)', value: current?.evidence ?? '' },
  ];
}

/** Agrega una pregunta, o reemplaza la de la posición dada, y guarda la lista completa. */
export function ChecklistItemForm(props: {
  readonly audit: Audit;
  readonly index?: number;
}): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  const current: AuditChecklistItem | undefined =
    props.index === undefined ? undefined : props.audit.checklist[props.index];
  const editing = current !== undefined;
  return (
    <HrDialogForm
      allowed={can('qms.audit.execute') && props.audit.status === 'in_progress'}
      label={editing ? `Editar pregunta ${String((props.index ?? 0) + 1)}` : 'Agregar pregunta'}
      title={editing ? 'Editar la pregunta' : 'Agregar una pregunta a la lista de chequeo'}
      description="Requisito, pregunta, resultado y evidencia (RE-SGC-003)."
      fields={checklistFields(current)}
      schema={saveChecklistSchema}
      prepare={(values) => {
        const item = { ...values, evidence: orNull(values['evidence']) };
        // La lista se valida completa con el esquema antes de enviarse.
        const items: unknown[] = [...props.audit.checklist];
        items.splice(props.index ?? items.length, props.index === undefined ? 0 : 1, item);
        return { items };
      }}
      run={(body, csrfToken) =>
        api.put(`/v1/qms/audits/${props.audit.id}/checklist`, {
          body,
          csrfToken,
          version: props.audit.version,
        })
      }
      submitLabel="Guardar"
      refresh={QMS_REFRESH}
    />
  );
}

export function AddFinding({ audit }: AuditProps): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  return (
    <HrDialogForm
      allowed={can('qms.audit.execute') && audit.status === 'in_progress'}
      label="Registrar hallazgo"
      title={`Registrar un hallazgo de ${audit.code}`}
      description="Las no conformidades abrirán su no conformidad al emitir el informe."
      fields={[
        { key: 'type', label: 'Tipo', options: optionsOf(FINDING_TYPES) },
        { key: 'requirement', label: 'Requisito' },
        { key: 'description', label: 'Descripción' },
        { key: 'evidence', label: 'Evidencia objetiva' },
      ]}
      schema={addFindingSchema}
      run={(body, csrfToken) =>
        api.post(`/v1/qms/audits/${audit.id}/findings`, {
          body,
          csrfToken,
          schema: qmsCreatedResponseSchema,
        })
      }
      submitLabel="Registrar"
      refresh={QMS_REFRESH}
    />
  );
}

export function ReportAudit({ audit }: AuditProps): JSX.Element | null {
  const api = useApiClient();
  const { can } = usePermissions();
  return (
    <HrDialogForm
      allowed={can('qms.audit.execute') && audit.status === 'in_progress'}
      label="Emitir informe"
      title={`Emitir el informe de ${audit.code}`}
      description="Cada hallazgo de no conformidad abrirá su no conformidad. Después no se agregan hallazgos."
      fields={[
        { key: 'reported_on', label: 'Fecha del informe', type: 'date', value: bogotaToday() },
        { key: 'conclusions', label: 'Conclusiones' },
      ]}
      schema={reportAuditSchema}
      run={(body, csrfToken) =>
        api.post(`/v1/qms/audits/${audit.id}/actions/report`, {
          body,
          csrfToken,
          version: audit.version,
        })
      }
      submitLabel="Emitir"
      refresh={QMS_REFRESH}
    />
  );
}

export function CloseAudit({ audit }: AuditProps): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  if (!canAll('qms.audit.plan') || audit.status !== 'reported') return null;
  return (
    <HrActionButton
      label="Cerrar auditoría"
      pendingLabel="Cerrando…"
      ariaLabel={`Cerrar ${audit.code}`}
      run={(csrfToken) =>
        api.post(`/v1/qms/audits/${audit.id}/actions/close`, {
          body: {},
          csrfToken,
          version: audit.version,
        })
      }
      refresh={QMS_REFRESH}
    />
  );
}

export function CancelAudit({ audit }: AuditProps): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const open = audit.status === 'planned' || audit.status === 'in_progress';
  return (
    <HrDialogForm
      allowed={canAll('qms.audit.plan') && open}
      label="Cancelar auditoría"
      title={`Cancelar ${audit.code}`}
      description="Indique por qué se cancela."
      fields={[{ key: 'reason', label: 'Motivo' }]}
      schema={cancelAuditSchema}
      run={(body, csrfToken) =>
        api.post(`/v1/qms/audits/${audit.id}/actions/cancel`, {
          body,
          csrfToken,
          version: audit.version,
        })
      }
      submitLabel="Cancelar auditoría"
      refresh={QMS_REFRESH}
    />
  );
}

export function FindingAction(props: {
  readonly audit: Audit;
  readonly finding: AuditFinding;
}): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const allowed =
    canAll('qms.action.manage') &&
    (props.finding.type === 'observation' || props.finding.type === 'opportunity') &&
    props.finding.action === null &&
    (props.audit.status === 'reported' || props.audit.status === 'closed');
  const people = useQmsPeople(allowed);
  return (
    <HrDialogForm
      allowed={allowed}
      label="Crear acción de mejora"
      title="Crear la acción de mejora del hallazgo"
      description="La acción queda en la bitácora con su responsable y fecha."
      fields={[
        { key: 'description', label: 'Qué se hará' },
        { key: 'responsible_id', label: 'Responsable', options: people },
        { key: 'due_on', label: 'Fecha compromiso', type: 'date' },
      ]}
      schema={findingActionSchema}
      run={(body, csrfToken) =>
        api.post(`/v1/qms/findings/${props.finding.id}/actions/action`, {
          body,
          csrfToken,
          schema: qmsCodeResponseSchema,
        })
      }
      submitLabel="Crear"
      refresh={QMS_REFRESH}
    />
  );
}

/** Descarga del informe en PDF, cuando ya está listo. */
export function ReportPdf(props: {
  readonly audit: Audit;
  readonly mine: boolean;
}): JSX.Element | null {
  const api = useApiClient();
  if (props.audit.report_document_id === null) return null;
  const path = props.mine
    ? `/v1/qms/my/audits/${props.audit.id}/report/download-link`
    : `/v1/qms/audits/${props.audit.id}/report/download-link`;
  return (
    <HrActionButton
      label="Descargar informe (PDF)"
      pendingLabel="Preparando…"
      ariaLabel={`Descargar el informe de ${props.audit.code}`}
      run={async (csrfToken) => {
        const link = await api.post(path, {
          body: {},
          csrfToken,
          schema: downloadLinkResponseSchema,
        });
        window.open(link.url, '_self');
      }}
    />
  );
}
