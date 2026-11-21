'use client';

import {
  PROCESS_TYPES,
  qmsCreatedResponseSchema,
  qmsProcessListResponseSchema,
  saveCharacterizationSchema,
  type Characterization,
  type ProcessType,
  type QmsProcess,
  type SaveCharacterization,
} from '@arza/contracts';
import { Badge, PageHeader } from '@arza/ui';
import type { JSX } from 'react';

import type { ApiClient } from '../../lib/api/api-client';
import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection, optionsOf, orNull } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { usePermissions } from '../session/permissions';
import { QMS_REFRESH, useQmsQuery } from './quality-queries';

// Mapa de procesos (B38, ficha 17.15): los procesos del organigrama agrupados por tipo, con su
// caracterización. El código, el nombre y el responsable salen de Administración › Organización.

const TYPE_ORDER = Object.keys(PROCESS_TYPES) as ProcessType[];
const GROUP_TITLES: Readonly<Record<ProcessType, string>> = {
  strategic: 'Procesos estratégicos',
  core: 'Procesos misionales',
  support: 'Procesos de apoyo',
  evaluation: 'Procesos de evaluación',
};

function characterizationFields(current: Characterization | null): HrField[] {
  return [
    {
      key: 'process_type',
      label: 'Tipo de proceso',
      options: optionsOf(PROCESS_TYPES),
      value: current?.process_type ?? '',
    },
    { key: 'objective', label: 'Objetivo', value: current?.objective ?? '' },
    { key: 'scope', label: 'Alcance (opcional)', value: current?.scope ?? '' },
    { key: 'inputs', label: 'Entradas (opcional)', value: current?.inputs ?? '' },
    { key: 'outputs', label: 'Salidas (opcional)', value: current?.outputs ?? '' },
  ];
}

/** Crea la caracterización la primera vez; después la actualiza con su versión. */
function saveCharacterization(api: ApiClient, process: QmsProcess) {
  const current = process.characterization;
  return (body: SaveCharacterization, csrfToken: string): Promise<unknown> =>
    current === null
      ? api.post(`/v1/qms/processes/${process.id}/characterization`, {
          body,
          csrfToken,
          schema: qmsCreatedResponseSchema,
        })
      : api.patch(`/v1/qms/characterizations/${current.id}`, {
          body,
          csrfToken,
          version: current.version,
        });
}

function Characterize({ process }: { readonly process: QmsProcess }): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const current = process.characterization;
  return (
    <HrDialogForm
      allowed={canAll('qms.process.manage')}
      label={current === null ? 'Caracterizar' : 'Actualizar caracterización'}
      title={`Caracterización · ${process.code} ${process.name}`}
      description="Tipo, objetivo, alcance, entradas y salidas del proceso."
      fields={characterizationFields(current)}
      schema={saveCharacterizationSchema}
      prepare={(values) => ({
        process_type: values['process_type'],
        objective: values['objective'],
        scope: orNull(values['scope']),
        inputs: orNull(values['inputs']),
        outputs: orNull(values['outputs']),
        document_id: current?.document_id ?? null,
      })}
      run={saveCharacterization(api, process)}
      submitLabel="Guardar"
      refresh={QMS_REFRESH}
    />
  );
}

function ProcessRow({ process }: { readonly process: QmsProcess }): JSX.Element {
  const current = process.characterization;
  return (
    <>
      <span className="flex flex-col gap-1">
        <span>
          <strong>{process.code}</strong> · {process.name}
          {process.owner_position === null ? '' : ` · responsable: ${process.owner_position.name}`}
        </span>
        {current === null ? (
          <Badge tone="warning">Sin caracterización</Badge>
        ) : (
          <span className="text-muted-foreground">Objetivo: {current.objective}</span>
        )}
      </span>
      <Characterize process={process} />
    </>
  );
}

/** Los procesos por tipo, en el orden del mapa; al final, los que aún no tienen tipo. */
function groupsOf(processes: readonly QmsProcess[]) {
  return [
    ...TYPE_ORDER.map((type) => ({
      title: GROUP_TITLES[type],
      items: processes.filter((p) => p.characterization?.process_type === type),
    })),
    {
      title: 'Sin tipo asignado',
      items: processes.filter((p) => p.characterization === null),
    },
  ].filter((group) => group.items.length > 0);
}

function ProcessMap({ processes }: { readonly processes: readonly QmsProcess[] }): JSX.Element {
  const groups = groupsOf(processes);
  if (groups.length === 0) return <p className="text-muted-foreground">No hay procesos activos.</p>;
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.title} aria-label={group.title} className="space-y-2">
          <h3 className="font-semibold">{group.title}</h3>
          <HrList
            items={group.items}
            empty=""
            keyOf={(item) => item.id}
            render={(item) => <ProcessRow process={item} />}
          />
        </section>
      ))}
    </div>
  );
}

export function QualityProcesses(): JSX.Element {
  const query = useQmsQuery('/v1/qms/processes', qmsProcessListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Mapa de procesos"
        description="Los procesos vienen del organigrama; aquí se registra su tipo y su caracterización."
      />
      <HrSection id="procesos" title="Procesos por tipo">
        <QueryState query={query} loadingLabel="Cargando el mapa">
          {({ data }) => <ProcessMap processes={data} />}
        </QueryState>
      </HrSection>
    </div>
  );
}
