'use client';

import {
  ANALYSIS_METHODS,
  ISHIKAWA_CATEGORIES,
  NONCONFORMITY_CLASSES,
  analyzeNonconformitySchema,
  closeNonconformitySchema,
  containNonconformitySchema,
  createQmsActionSchema,
  qmsCodeResponseSchema,
  reopenNonconformitySchema,
  type IshikawaCategory,
  type NonconformitySummary,
} from '@arza/contracts';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { HrActionButton, HrDialogForm, optionsOf, orNull } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { QMS_REFRESH, bogotaToday, useQmsPeople, useQmsProcesses } from './quality-queries';

// Los pasos de una no conformidad (B38, ficha 17.15): contener, analizar la causa (decisión 7),
// agregar acciones, registrar el plan y cerrar o reabrir. Cada botón aparece solo en el estado
// que lo admite y con el permiso que lo exige.

type Post = (step: string, body: object, csrfToken: string) => Promise<unknown>;
interface StepProps {
  readonly item: NonconformitySummary;
  readonly post: Post;
}

const WHYS = ['1', '2', '3', '4', '5'] as const;
const CATEGORIES = Object.keys(ISHIKAWA_CATEGORIES) as IshikawaCategory[];

function ContainStep(props: StepProps): JSX.Element | null {
  const processes = useQmsProcesses(props.item.status === 'detected');
  return (
    <HrDialogForm
      allowed={props.item.status === 'detected'}
      label="Contener"
      title={`Corrección inmediata · ${props.item.code}`}
      description="Registre qué se hizo de inmediato, la clasificación y el proceso."
      fields={[
        { key: 'containment', label: 'Corrección inmediata' },
        {
          key: 'classification',
          label: 'Clasificación',
          options: optionsOf(NONCONFORMITY_CLASSES),
        },
        { key: 'process_id', label: 'Proceso', options: processes },
        { key: 'contained_on', label: 'Fecha', type: 'date', value: bogotaToday() },
      ]}
      schema={containNonconformitySchema}
      run={(body, csrfToken) => props.post('contain', body, csrfToken)}
      submitLabel="Registrar contención"
      refresh={QMS_REFRESH}
    />
  );
}

function analysisOf(values: Record<string, string>) {
  const filled = (value: string | undefined) => (value ?? '').trim() !== '';
  if (values['method'] === 'ishikawa') {
    const causes = Object.fromEntries(
      CATEGORIES.map((key) => {
        const cause = values[`cause_${key}`];
        return [key, filled(cause) ? [cause] : []];
      }),
    );
    return { method: 'ishikawa', causes };
  }
  const whys = WHYS.map((n) => values[`why_${n}`] ?? '').filter((why) => why.trim() !== '');
  return { method: 'five_whys', whys };
}

function AnalyzeStep(props: StepProps): JSX.Element | null {
  const open = ['contained', 'analyzing', 'reopened'].includes(props.item.status);
  return (
    <HrDialogForm
      allowed={open}
      label="Analizar causa"
      title={`Análisis de causa · ${props.item.code}`}
      description="Use los cinco porqués o la espina de pescado (6M). La causa raíz es obligatoria."
      fields={[
        { key: 'method', label: 'Método', options: optionsOf(ANALYSIS_METHODS) },
        ...WHYS.map((n) => ({ key: `why_${n}`, label: `¿Por qué? ${n} (cinco porqués)` })),
        // La categoría «método» de las 6M no puede compartir clave con el método de análisis.
        ...CATEGORIES.map((key) => ({
          key: `cause_${key}`,
          label: `${ISHIKAWA_CATEGORIES[key]} (espina de pescado)`,
        })),
        { key: 'root_cause', label: 'Causa raíz' },
      ]}
      schema={analyzeNonconformitySchema}
      prepare={(values) => ({ analysis: analysisOf(values), root_cause: values['root_cause'] })}
      run={(body, csrfToken) => props.post('analyze', body, csrfToken)}
      submitLabel="Guardar análisis"
      refresh={QMS_REFRESH}
    />
  );
}

function AddAction({ item }: { readonly item: NonconformitySummary }): JSX.Element | null {
  const api = useApiClient();
  const open = ['analyzing', 'planned', 'reopened'].includes(item.status);
  const people = useQmsPeople(open);
  return (
    <HrDialogForm
      allowed={open}
      label="Agregar acción"
      title={`Acción correctiva · ${item.code}`}
      description="Cada acción tiene responsable y fecha compromiso; el responsable recibe el aviso."
      fields={[
        { key: 'description', label: 'Qué se hará' },
        { key: 'responsible_id', label: 'Responsable', options: people },
        { key: 'due_on', label: 'Fecha compromiso', type: 'date' },
        { key: 'notes', label: 'Observaciones (opcional)' },
      ]}
      schema={createQmsActionSchema}
      prepare={(values) => ({
        ...values,
        origin_type: 'nonconformity',
        origin_id: item.id,
        process_id: null,
        notes: orNull(values['notes']),
      })}
      run={(body, csrfToken) =>
        api.post('/v1/qms/actions', { body, csrfToken, schema: qmsCodeResponseSchema })
      }
      submitLabel="Agregar acción"
      refresh={QMS_REFRESH}
    />
  );
}

function CloseSteps(props: StepProps): JSX.Element | null {
  if (props.item.status !== 'verified') return null;
  return (
    <>
      <HrDialogForm
        allowed
        label="Cerrar como eficaz"
        title={`Cerrar · ${props.item.code}`}
        description="Todas sus acciones resultaron eficaces."
        fields={[{ key: 'note', label: 'Nota de cierre (opcional)' }]}
        schema={closeNonconformitySchema}
        prepare={(values) => ({ note: orNull(values['note']) })}
        run={(body, csrfToken) => props.post('close', body, csrfToken)}
        submitLabel="Cerrar"
        refresh={QMS_REFRESH}
      />
      <HrDialogForm
        allowed
        label="Reabrir"
        title={`Reabrir · ${props.item.code}`}
        description="La no conformidad vuelve a análisis."
        fields={[{ key: 'reason', label: 'Por qué no fue eficaz' }]}
        schema={reopenNonconformitySchema}
        run={(body, csrfToken) => props.post('reopen', body, csrfToken)}
        submitLabel="Reabrir"
        refresh={QMS_REFRESH}
      />
    </>
  );
}

export function NonconformitySteps({ item }: { readonly item: NonconformitySummary }): JSX.Element {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const post: Post = (step, body, csrfToken) =>
    api.post(`/v1/qms/nonconformities/${item.id}/actions/${step}`, {
      body,
      csrfToken,
      version: item.version,
    });
  const manages = canAll('qms.nonconformity.manage');
  return (
    <div className="flex flex-wrap gap-2">
      {manages ? <ContainStep item={item} post={post} /> : null}
      {manages ? <AnalyzeStep item={item} post={post} /> : null}
      {canAll('qms.action.manage') ? <AddAction item={item} /> : null}
      {manages && item.status === 'analyzing' ? (
        <HrActionButton
          label="Registrar plan"
          pendingLabel="Registrando…"
          ariaLabel={`Registrar el plan de ${item.code}`}
          run={(csrfToken) => post('plan', {}, csrfToken)}
          refresh={QMS_REFRESH}
        />
      ) : null}
      {canAll('qms.nonconformity.close') ? <CloseSteps item={item} post={post} /> : null}
    </div>
  );
}
