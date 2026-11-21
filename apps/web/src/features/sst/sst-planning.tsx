'use client';

import {
  CONSEQUENCE_LEVELS,
  DEFICIENCY_LEVELS,
  EXPOSURE_LEVELS,
  HAZARD_CLASSES,
  HAZARD_RISK_ACCEPTABILITY,
  hazardListResponseSchema,
  saveHazardSchema,
  sstCreatedResponseSchema,
  type Hazard,
} from '@arza/contracts';
import { Badge, PageHeader } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection, optionsOf, orNull } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { useProcesses } from './sst-options';
import { useSstQuery } from './sst-queries';

// Matriz de peligros con la metodología GTC 45 (B37, decisión 3). Quien la diligencia indica los
// niveles; la plataforma calcula el nivel de riesgo y su aceptabilidad.

const LEVEL_TONE = { I: 'destructive', II: 'warning', III: 'info', IV: 'success' } as const;

function levelOptions(levels: Readonly<Record<number, string>>) {
  return Object.entries(levels)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([value, label]) => ({ value, label: `${value} · ${label}` }));
}

function hazardFields(processes: readonly { value: string; label: string }[]) {
  return [
    { key: 'process_id', label: 'Proceso', options: processes },
    { key: 'activity', label: 'Actividad o tarea' },
    { key: 'hazard_class', label: 'Clase de peligro', options: optionsOf(HAZARD_CLASSES) },
    { key: 'hazard', label: 'Descripción del peligro' },
    { key: 'effects', label: 'Efectos posibles' },
    { key: 'existing_controls', label: 'Controles existentes (opcional)' },
    { key: 'deficiency', label: 'Nivel de deficiencia', options: levelOptions(DEFICIENCY_LEVELS) },
    { key: 'exposure', label: 'Nivel de exposición', options: levelOptions(EXPOSURE_LEVELS) },
    {
      key: 'consequence',
      label: 'Nivel de consecuencia',
      options: levelOptions(CONSEQUENCE_LEVELS),
    },
    { key: 'proposed_controls', label: 'Controles propuestos (opcional)' },
    { key: 'review_on', label: 'Próxima revisión', type: 'date' as const },
  ];
}

function hazardBody(values: Record<string, string>) {
  return {
    ...values,
    routine: true,
    existing_controls: orNull(values['existing_controls']),
    proposed_controls: orNull(values['proposed_controls']),
    deficiency: Number(values['deficiency']),
    exposure: Number(values['exposure']),
    consequence: Number(values['consequence']),
  };
}

function NewHazard(): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const processes = useProcesses();
  return (
    <HrDialogForm
      allowed={canAll('sst.hazard.manage')}
      label="Agregar peligro"
      title="Agregar un peligro a la matriz"
      description="Indique los niveles de la GTC 45; la plataforma calcula el nivel de riesgo."
      fields={hazardFields(processes)}
      schema={saveHazardSchema}
      prepare={hazardBody}
      run={(body, csrfToken) =>
        api.post('/v1/sst/hazards', { body, csrfToken, schema: sstCreatedResponseSchema })
      }
      submitLabel="Agregar"
    />
  );
}

function HazardRow({ item }: { readonly item: Hazard }): JSX.Element {
  return (
    <>
      <span className="flex flex-col">
        <span>
          <strong>{item.activity}</strong> · {item.process.name} ·{' '}
          {HAZARD_CLASSES[item.hazard_class]}
        </span>
        <span className="text-muted-foreground">
          {item.hazard} · efectos: {item.effects}
        </span>
        <span>Revisión: {formatDate(item.review_on)}</span>
      </span>
      <Badge tone={LEVEL_TONE[item.risk_level]}>
        Nivel {item.risk_level} ({String(item.risk)}) · {HAZARD_RISK_ACCEPTABILITY[item.risk_level]}
      </Badge>
    </>
  );
}

export function SstHazards(): JSX.Element {
  const query = useSstQuery('/v1/sst/hazards', hazardListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Matriz de peligros"
        description="Metodología GTC 45: del riesgo más alto al más bajo. Valores por validar con el responsable del SG-SST."
      />
      <HrSection id="peligros" title="Peligros identificados">
        <NewHazard />
        <QueryState query={query} loadingLabel="Cargando la matriz">
          {({ data }) => (
            <HrList
              items={data}
              empty="La matriz aún no tiene peligros."
              keyOf={(item) => item.id}
              render={(item) => <HazardRow item={item} />}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
