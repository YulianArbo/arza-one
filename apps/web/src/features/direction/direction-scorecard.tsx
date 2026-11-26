'use client';

import {
  INDICATOR_TRENDS,
  indicatorListResponseSchema,
  qmsCodeResponseSchema,
  SCORECARD_PERSPECTIVES,
  SCORECARD_STATUSES,
  saveStrategicObjectiveSchema,
  scorecardResponseSchema,
  strategicObjectiveListResponseSchema,
  type Indicator,
  type ScorecardObjective,
  type ScorecardStatus,
  type StrategicObjective,
} from '@arza/contracts';
import { Badge, SimpleTable, TableCell, TableRow } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrSection, optionsOf } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { usePermissions } from '../session/permissions';
import { shownValue } from '../quality/quality-indicators';
import { LinkIndicatorsCell } from './direction-objective-links';
import { DIRECTION_REFRESH, useDirectionQuery } from './direction-queries';

// Cuadro de mando integral (B46, decisiones 4 y 5): los objetivos del plan estratégico por
// perspectiva, con sus indicadores, el último resultado y si cumplen. Calidad registra los
// objetivos y les asigna indicadores.

const STATUS_TONE: Readonly<
  Record<ScorecardStatus, 'success' | 'warning' | 'destructive' | 'neutral'>
> = {
  meets: 'success',
  partial: 'warning',
  fails: 'destructive',
  no_data: 'neutral',
};

function ObjectiveTable({ objective }: { readonly objective: ScorecardObjective }): JSX.Element {
  if (objective.indicators.length === 0) {
    return <p className="text-sm text-muted-foreground">Aún no tiene indicadores asignados.</p>;
  }
  return (
    <SimpleTable
      headers={['Indicador', 'Proceso', 'Meta', 'Último resultado', 'Tendencia']}
      scrollLabel={`Indicadores de ${objective.code}`}
    >
      {objective.indicators.map((item) => (
        <TableRow key={item.id}>
          <TableCell>
            <strong>{item.code}</strong> · {item.name}
          </TableCell>
          <TableCell>{item.process}</TableCell>
          <TableCell>{shownValue(item.target, item.unit)}</TableCell>
          <TableCell>
            {item.value === null
              ? 'Sin medición'
              : `${shownValue(item.value, item.unit)} · ${item.period ?? ''}`}
            {item.meets === null ? null : (
              <Badge tone={item.meets ? 'success' : 'destructive'}>
                {item.meets ? 'Cumple' : 'No cumple'}
              </Badge>
            )}
          </TableCell>
          <TableCell>{item.trend === null ? '—' : INDICATOR_TRENDS[item.trend]}</TableCell>
        </TableRow>
      ))}
    </SimpleTable>
  );
}

function ObjectiveCard({ objective }: { readonly objective: ScorecardObjective }): JSX.Element {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-medium">
          {objective.code} · {objective.name}
        </h3>
        <Badge tone={STATUS_TONE[objective.status]}>{SCORECARD_STATUSES[objective.status]}</Badge>
      </div>
      <ObjectiveTable objective={objective} />
    </section>
  );
}

/** El cuadro de mando con sus cuatro perspectivas. */
export function Scorecard(): JSX.Element {
  const query = useDirectionQuery('/v1/dashboards/scorecard/data', scorecardResponseSchema);
  return (
    <QueryState query={query} loadingLabel="Cargando el cuadro de mando">
      {(data) => (
        <div className="flex flex-col gap-6">
          {data.scope === 'own' ? (
            <p className="text-sm text-muted-foreground">
              Ve los objetivos que miden los procesos de su cargo.
            </p>
          ) : null}
          {data.perspectives.map((group) => (
            <HrSection
              key={group.perspective}
              id={`perspectiva-${group.perspective}`}
              title={group.label}
            >
              {group.objectives.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin objetivos en esta perspectiva.</p>
              ) : (
                group.objectives.map((objective) => (
                  <ObjectiveCard key={objective.id} objective={objective} />
                ))
              )}
            </HrSection>
          ))}
        </div>
      )}
    </QueryState>
  );
}

function objectiveFields(item?: StrategicObjective): HrField[] {
  const year = new Date().getFullYear();
  return [
    {
      key: 'perspective',
      label: 'Perspectiva',
      options: optionsOf(SCORECARD_PERSPECTIVES),
      value: item?.perspective ?? 'financial',
    },
    { key: 'name', label: 'Objetivo', value: item?.name ?? '' },
    { key: 'description', label: 'Descripción (opcional)', value: item?.description ?? '' },
    {
      key: 'year_from',
      label: 'Año en que empieza',
      type: 'number',
      value: String(item?.year_from ?? year),
    },
    {
      key: 'year_to',
      label: 'Año en que termina',
      type: 'number',
      value: String(item?.year_to ?? year + 2),
    },
    {
      key: 'active',
      label: 'Activo',
      options: [
        { value: 'true', label: 'Sí' },
        { value: 'false', label: 'No' },
      ],
      value: String(item?.active ?? true),
    },
  ];
}

function prepareObjective(values: Record<string, string>): unknown {
  return {
    ...values,
    description: values['description'] === '' ? null : values['description'],
    year_from: Number(values['year_from']),
    year_to: Number(values['year_to']),
    active: values['active'] !== 'false',
  };
}

export function ObjectiveForm({
  item,
}: {
  readonly item?: StrategicObjective;
}): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const editing = item !== undefined;
  return (
    <HrDialogForm
      allowed={canAll('qms.indicator.manage')}
      label={editing ? 'Editar' : 'Registrar objetivo'}
      title={editing ? `Editar ${item.code}` : 'Registrar un objetivo estratégico'}
      description="Los objetivos vienen del plan estratégico (PL-DG-001)."
      fields={objectiveFields(item)}
      schema={saveStrategicObjectiveSchema}
      prepare={prepareObjective}
      run={(body, csrfToken) =>
        editing
          ? api.patch(`/v1/qms/strategic-objectives/${item.id}`, {
              body,
              csrfToken,
              version: item.version,
            })
          : api.post('/v1/qms/strategic-objectives', {
              body,
              csrfToken,
              schema: qmsCodeResponseSchema,
            })
      }
      submitLabel="Guardar"
      refresh={DIRECTION_REFRESH}
    />
  );
}

function ObjectiveRow(props: {
  readonly item: StrategicObjective;
  readonly indicators: readonly Indicator[];
}): JSX.Element {
  const { item } = props;
  return (
    <TableRow>
      <TableCell>
        <strong>{item.code}</strong> · {item.name}
        {item.active ? '' : ' (inactivo)'}
      </TableCell>
      <TableCell>{SCORECARD_PERSPECTIVES[item.perspective]}</TableCell>
      <TableCell>
        {item.year_from} – {item.year_to}
      </TableCell>
      <TableCell>{item.indicator_ids.length}</TableCell>
      <TableCell>
        <ObjectiveForm item={item} />
        <LinkIndicatorsCell objective={item} indicators={props.indicators} />
      </TableCell>
    </TableRow>
  );
}

/** Lista de objetivos para Calidad: registrar, editar y asignar indicadores. */
export function ObjectiveAdmin(): JSX.Element | null {
  const { canAll } = usePermissions();
  const manages = canAll('qms.indicator.manage');
  const query = useDirectionQuery(
    '/v1/qms/strategic-objectives',
    strategicObjectiveListResponseSchema,
    manages,
  );
  const indicators = useDirectionQuery('/v1/qms/indicators', indicatorListResponseSchema, manages);
  if (!manages) return null;
  return (
    <HrSection id="objetivos" title="Objetivos estratégicos">
      <ObjectiveForm />
      <QueryState query={query} loadingLabel="Cargando los objetivos">
        {({ data }) => (
          <SimpleTable
            headers={['Objetivo', 'Perspectiva', 'Vigencia', 'Indicadores', '']}
            scrollLabel="Objetivos estratégicos"
          >
            {data.map((item) => (
              <ObjectiveRow key={item.id} item={item} indicators={indicators.data?.data ?? []} />
            ))}
          </SimpleTable>
        )}
      </QueryState>
    </HrSection>
  );
}
