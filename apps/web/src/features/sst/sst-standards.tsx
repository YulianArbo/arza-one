'use client';

import {
  STANDARD_CYCLES,
  STANDARD_RATINGS,
  STANDARD_RESULTS,
  assessStandardSchema,
  standardsAssessmentSchema,
  type StandardItem,
  type StandardsScore,
} from '@arza/contracts';
import { Badge, PageHeader, StatCard } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection, optionsOf, orNull } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { currentYear } from './sst-options';
import { useSstQuery } from './sst-queries';

// Autoevaluación de estándares mínimos (B37, decisión 4; Resolución 0312 de 2019). Tabla de valores
// por validar con el responsable del SG-SST y contra RE-SST-003.

/** 8550 → «85,50». */
export function points(hundredths: number): string {
  return (hundredths / 100).toFixed(2).replace('.', ',');
}

const RATING_TONE = {
  critical: 'destructive',
  moderate: 'warning',
  acceptable: 'success',
} as const;

function assessFields(item: StandardItem) {
  return [
    {
      key: 'result',
      label: 'Resultado',
      options: optionsOf(STANDARD_RESULTS),
      value: item.result ?? '',
    },
    {
      key: 'justification',
      label: 'Justificación (si no aplica)',
      value: item.justification ?? '',
    },
    {
      key: 'improvement',
      label: 'Acción de mejora (si no cumple)',
      value: item.improvement ?? '',
    },
  ];
}

function assessBody(values: Record<string, string>) {
  return {
    result: values['result'],
    justification: orNull(values['justification']),
    improvement: orNull(values['improvement']),
    evidence_file_id: null,
  };
}

function AssessDialog(props: { readonly item: StandardItem; readonly year: number }) {
  const api = useApiClient();
  const { item } = props;
  return (
    <HrDialogForm
      allowed
      label="Evaluar"
      title={`Evaluar ${item.code}`}
      description={item.label}
      fields={assessFields(item)}
      schema={assessStandardSchema}
      prepare={assessBody}
      run={(body, csrfToken) =>
        api.put(`/v1/sst/standards-assessments/${String(props.year)}/standards/${item.code}`, {
          body,
          csrfToken,
          ...(item.version === 0 ? {} : { version: item.version }),
        })
      }
      submitLabel="Guardar"
    />
  );
}

function StandardRow(props: {
  readonly item: StandardItem;
  readonly year: number;
  readonly manages: boolean;
}): JSX.Element {
  const { item } = props;
  return (
    <>
      <span className="flex flex-col">
        <span>
          <strong>{item.code}</strong> · {item.label}
        </span>
        <span className="text-muted-foreground">
          Peso {points(item.weight)} ·{' '}
          {item.result === null ? 'Sin evaluar' : STANDARD_RESULTS[item.result]}
          {item.justification === null ? '' : ` · ${item.justification}`}
          {item.improvement === null ? '' : ` · mejora: ${item.improvement}`}
        </span>
      </span>
      {props.manages ? <AssessDialog item={item} year={props.year} /> : null}
    </>
  );
}

function Score({ score }: { readonly score: StandardsScore }): JSX.Element {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <StatCard
        label="Puntaje"
        value={`${points(score.score)} de 100`}
        note={`${String(score.assessed)} de ${String(score.total)} estándares evaluados`}
      />
      <div className="flex items-center">
        <Badge tone={RATING_TONE[score.rating]}>{STANDARD_RATINGS[score.rating]}</Badge>
      </div>
    </div>
  );
}

export function SstStandards(): JSX.Element {
  const { canAll } = usePermissions();
  const year = currentYear();
  const path = `/v1/sst/standards-assessments/${String(year)}`;
  const query = useSstQuery(path, standardsAssessmentSchema);
  const manages = canAll('sst.standards.manage');
  const cycles = Object.keys(STANDARD_CYCLES) as (keyof typeof STANDARD_CYCLES)[];
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Estándares mínimos ${String(year)}`}
        description="Resolución 0312 de 2019: 60 estándares que suman 100 puntos. Tabla por validar con el responsable del SG-SST."
      />
      <QueryState query={query} loadingLabel="Cargando la autoevaluación">
        {({ score, data }) => (
          <>
            <Score score={score} />
            {cycles.map((cycle) => (
              <HrSection key={cycle} id={`ciclo-${cycle}`} title={STANDARD_CYCLES[cycle]}>
                <HrList
                  items={data.filter((item) => item.cycle === cycle)}
                  empty="Sin estándares."
                  keyOf={(item) => item.code}
                  render={(item) => <StandardRow item={item} year={year} manages={manages} />}
                />
              </HrSection>
            ))}
          </>
        )}
      </QueryState>
    </div>
  );
}
