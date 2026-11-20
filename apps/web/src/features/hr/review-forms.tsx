'use client';

import {
  createReviewSchema,
  hrCreatedResponseSchema,
  scoreReviewSchema,
  type HrRef,
  type PerformanceReview,
} from '@arza/contracts';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import type { HrField } from './hr-form';
import { HrDialogForm } from './hr-dialog';

// Evaluación de desempeño (B36, decisión 7): se fijan hasta cuatro objetivos con su peso (que suman
// 100 %) y después se califica cada uno de 1 a 5 con un comentario.

const OBJECTIVE_ROWS = [1, 2, 3, 4] as const;

function objectiveFields(): HrField[] {
  return OBJECTIVE_ROWS.flatMap((row) => [
    { key: `title_${String(row)}`, label: `Objetivo ${String(row)}` },
    {
      key: `weight_${String(row)}`,
      label: `Peso del objetivo ${String(row)} (%)`,
      type: 'number' as const,
    },
  ]);
}

/** Los objetivos escritos; las filas vacías no cuentan. */
function objectivesOf(values: Record<string, string>) {
  return OBJECTIVE_ROWS.flatMap((row) => {
    const title = values[`title_${String(row)}`]?.trim() ?? '';
    if (title === '') return [];
    return [{ title, weight: Number(values[`weight_${String(row)}`] ?? '') }];
  });
}

export function NewReview(props: { readonly employees: readonly HrRef[] }): JSX.Element | null {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  return (
    <HrDialogForm
      allowed={props.employees.length > 0}
      label="Nueva evaluación"
      title="Fijar los objetivos de una evaluación"
      description="Escriba hasta cuatro objetivos; los pesos deben sumar 100 %."
      fields={[
        {
          key: 'employee_id',
          label: 'Colaborador',
          options: props.employees.map(({ id, name }) => ({ value: id, label: name })),
        },
        { key: 'period', label: 'Periodo (por ejemplo 2026 o 2026-S2)' },
        ...objectiveFields(),
      ]}
      schema={createReviewSchema}
      prepare={(values) => ({
        employee_id: values['employee_id'],
        period: values['period'],
        objectives: objectivesOf(values),
      })}
      run={(body, csrfToken) =>
        api.post('/v1/hr/performance-reviews', {
          body,
          csrfToken,
          schema: hrCreatedResponseSchema,
          idempotencyKey: key,
        })
      }
      submitLabel="Guardar objetivos"
    />
  );
}

export function ScoreReview({
  review,
}: {
  readonly review: PerformanceReview;
}): JSX.Element | null {
  const api = useApiClient();
  return (
    <HrDialogForm
      allowed={review.can_score}
      label="Calificar"
      title={`Calificar a ${review.employee.name}`}
      description="Califique cada objetivo de 1 (no cumple) a 5 (supera lo esperado)."
      fields={[
        ...review.objectives.map((objective, index) => ({
          key: `score_${String(index)}`,
          label: `${objective.title} (${String(objective.weight)} %)`,
          type: 'number' as const,
        })),
        { key: 'comment', label: 'Comentario para el colaborador' },
      ]}
      schema={scoreReviewSchema}
      prepare={(values) => ({
        scores: review.objectives.map((_objective, index) =>
          Number(values[`score_${String(index)}`]),
        ),
        comment: values['comment'],
      })}
      run={(body, csrfToken) =>
        api.post(`/v1/hr/performance-reviews/${review.id}/actions/score`, {
          body,
          csrfToken,
          version: review.version,
        })
      }
      submitLabel="Guardar calificación"
    />
  );
}
