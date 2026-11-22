'use client';

import {
  ACTION_ORIGINS,
  ACTION_STATUSES,
  ACTION_TYPES,
  createQmsActionSchema,
  executeQmsActionSchema,
  qmsActionListResponseSchema,
  qmsCodeResponseSchema,
  verifyQmsActionSchema,
  type QmsAction,
} from '@arza/contracts';
import { Badge, Button, PageHeader } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection, orNull } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import type { DownloadedFile } from '../../lib/api/api-client';
import { FormError, FormSuccess } from '../access/form-alert';
import { save } from '../audit/audit-export-button';
import { useHrAction } from '../hr/hr-queries';
import { QMS_REFRESH, bogotaToday, useQmsPeople, useQmsQuery } from './quality-queries';

// Bitácora de acciones correctivas y de mejora (RE-SGC-002, decisión 10): cada acción con su
// origen, hallazgo, causa raíz, responsable, fechas y verificación. La eficacia la verifica alguien
// distinto del responsable y de quien la ejecutó (decisión 8). Se descarga en CSV para Excel.

const STATUS_TONE = {
  open: 'warning',
  executed: 'info',
  effective: 'success',
  ineffective: 'destructive',
} as const;

export function ExecuteAction({ action }: { readonly action: QmsAction }): JSX.Element | null {
  const api = useApiClient();
  return (
    <HrDialogForm
      allowed={action.status === 'open'}
      label="Marcar ejecutada"
      title={`Ejecutar ${action.code}`}
      description={action.description}
      fields={[
        { key: 'evidence_note', label: 'Qué se hizo y dónde está la evidencia' },
        { key: 'executed_on', label: 'Fecha de ejecución', type: 'date', value: bogotaToday() },
      ]}
      schema={executeQmsActionSchema}
      prepare={(values) => ({ ...values, evidence_file_id: null })}
      run={(body, csrfToken) =>
        api.post(`/v1/qms/actions/${action.id}/actions/execute`, {
          body,
          csrfToken,
          version: action.version,
        })
      }
      submitLabel="Registrar ejecución"
      refresh={QMS_REFRESH}
    />
  );
}

function VerifyAction({ action }: { readonly action: QmsAction }): JSX.Element | null {
  const api = useApiClient();
  return (
    <HrDialogForm
      allowed={action.status === 'executed'}
      label="Verificar eficacia"
      title={`Verificar la eficacia de ${action.code}`}
      description="La verifica alguien distinto del responsable y de quien la ejecutó."
      fields={[
        {
          key: 'effective',
          label: 'Resultado',
          options: [
            { value: 'true', label: 'Eficaz: eliminó la causa' },
            { value: 'false', label: 'No eficaz: la no conformidad se reabre' },
          ],
        },
        { key: 'note', label: 'Cómo se verificó' },
        { key: 'verified_on', label: 'Fecha de verificación', type: 'date', value: bogotaToday() },
      ]}
      schema={verifyQmsActionSchema}
      prepare={(values) => ({ ...values, effective: values['effective'] === 'true' })}
      run={(body, csrfToken) =>
        api.post(`/v1/qms/actions/${action.id}/actions/verify`, {
          body,
          csrfToken,
          version: action.version,
        })
      }
      submitLabel="Registrar verificación"
      refresh={QMS_REFRESH}
    />
  );
}

function NewImprovement(): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const allowed = canAll('qms.action.manage');
  const people = useQmsPeople(allowed);
  return (
    <HrDialogForm
      allowed={allowed}
      label="Registrar acción de mejora"
      title="Registrar una acción de mejora"
      description="Una mejora no sale de una no conformidad ni de un riesgo."
      fields={[
        { key: 'description', label: 'Qué se hará' },
        { key: 'responsible_id', label: 'Responsable', options: people },
        { key: 'due_on', label: 'Fecha compromiso', type: 'date' },
        { key: 'notes', label: 'Observaciones (opcional)' },
      ]}
      schema={createQmsActionSchema}
      prepare={(values) => ({
        ...values,
        origin_type: 'improvement',
        origin_id: null,
        process_id: null,
        notes: orNull(values['notes']),
      })}
      run={(body, csrfToken) =>
        api.post('/v1/qms/actions', { body, csrfToken, schema: qmsCodeResponseSchema })
      }
      submitLabel="Registrar"
      refresh={QMS_REFRESH}
    />
  );
}

function ActionRow({ action }: { readonly action: QmsAction }): JSX.Element {
  const { canAll } = usePermissions();
  const origin = action.origin === null ? '' : ` ${action.origin.code}`;
  return (
    <>
      <span className="flex flex-col gap-1">
        <span>
          <strong>{action.code}</strong> · {ACTION_TYPES[action.action_type]} ·{' '}
          {ACTION_ORIGINS[action.origin_type]}
          {origin}
          {action.process === null ? '' : ` · ${action.process.name}`}
        </span>
        <span>{action.description}</span>
        {action.root_cause === null ? null : (
          <span className="text-muted-foreground">Causa raíz: {action.root_cause}</span>
        )}
        <span className="text-muted-foreground">
          {action.responsible.name} · abierta el {formatDate(action.opened_on)} · compromiso{' '}
          {formatDate(action.due_on)}
          {action.executed_on === null ? '' : ` · ejecutada el ${formatDate(action.executed_on)}`}
        </span>
        {action.verified_by === null ? null : (
          <span className="text-muted-foreground">
            Verificó {action.verified_by.name} el {formatDate(action.verified_on)}:{' '}
            {action.verification_note}
          </span>
        )}
        <Badge tone={action.overdue ? 'destructive' : STATUS_TONE[action.status]}>
          {action.overdue ? 'Vencida' : ACTION_STATUSES[action.status]}
        </Badge>
      </span>
      <div className="flex flex-wrap gap-2">
        {canAll('qms.action.manage') ? <ExecuteAction action={action} /> : null}
        {canAll('qms.action.verify') ? <VerifyAction action={action} /> : null}
      </div>
    </>
  );
}

/** Descarga el CSV de la bitácora; la descarga queda en la auditoría. */
function ExportLog(): JSX.Element {
  const api = useApiClient();
  const action = useHrAction<undefined, DownloadedFile>(
    (_input, csrfToken) => api.download('/v1/qms/actions/export', { body: {}, csrfToken }),
    save,
  );
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={action.pending}
        onClick={() => {
          action.execute(undefined);
        }}
      >
        {action.pending ? 'Descargando…' : 'Descargar bitácora (CSV)'}
      </Button>
      <div aria-live="polite">
        {action.result === undefined ? null : (
          <FormSuccess message={`Descargamos ${action.result.fileName}.`} />
        )}
      </div>
      {action.error === null ? null : <FormError error={action.error} />}
      {action.dialog}
    </div>
  );
}

export function QualityActions(): JSX.Element {
  const query = useQmsQuery('/v1/qms/actions', qmsActionListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Bitácora de acciones"
        description="RE-SGC-002: acciones correctivas y de mejora con su verificación. Columnas por validar con el formato."
      />
      <div className="flex flex-wrap gap-3">
        <NewImprovement />
        <ExportLog />
      </div>
      <HrSection id="acciones" title="Acciones">
        <QueryState query={query} loadingLabel="Cargando la bitácora">
          {({ data }) => (
            <HrList
              items={data}
              empty="La bitácora aún no tiene acciones."
              keyOf={(item) => item.id}
              render={(item) => <ActionRow action={item} />}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
