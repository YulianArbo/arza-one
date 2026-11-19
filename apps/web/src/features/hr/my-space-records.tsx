'use client';

import {
  DISCIPLINARY_DECISIONS,
  NOVELTY_UNITS,
  PERFORMANCE_REVIEW_STATUS,
  TRAINING_KINDS,
  agreeReviewSchema,
  completeMyTaskSchema,
  myTaskListResponseSchema,
  noveltyListResponseSchema,
  ownDisciplinaryListResponseSchema,
  performanceReviewListResponseSchema,
  trainingListResponseSchema,
  type MyTask,
  type PerformanceReview,
} from '@arza/contracts';
import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { bogotaToday } from '../crm/labels';
import { HrDialogForm, HrList, HrSection, orNull } from './hr-dialog';
import { useHrQuery } from './hr-queries';

// «Mi espacio» (B36): novedades de nómina, evaluaciones, formación, citaciones y las tareas de
// inducción o retiro a cargo de la persona. Del proceso disciplinario solo ve la citación y la
// decisión de su propio caso.

export function MyNovelties(): JSX.Element {
  const query = useHrQuery('/v1/hr/me/novelties', noveltyListResponseSchema);
  return (
    <HrSection id="mis-novedades" title="Mis novedades de nómina">
      <QueryState query={query} loadingLabel="Cargando novedades">
        {({ data }) => (
          <HrList
            items={data}
            empty="No tiene novedades registradas."
            keyOf={(item) => item.id}
            render={(item) => (
              <>
                <span>
                  <strong>{item.concept_label}</strong> · mes {item.period}
                </span>
                <span>
                  {item.quantity.replace('.', ',')} {NOVELTY_UNITS[item.unit].toLowerCase()}
                </span>
              </>
            )}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

function ReviewRow({ review }: { readonly review: PerformanceReview }): JSX.Element {
  const api = useApiClient();
  return (
    <>
      <span>
        <strong>Periodo {review.period}</strong> · {PERFORMANCE_REVIEW_STATUS[review.status]}
        {review.score === null ? null : ` · ${review.score.replace('.', ',')} de 5`}
      </span>
      {review.reviewer_comment === null ? null : <span>{review.reviewer_comment}</span>}
      <HrDialogForm
        allowed={review.can_agree}
        label="Aceptar evaluación"
        title="Aceptar la evaluación"
        description="Puede dejar un comentario. Una vez aceptada, la evaluación no cambia."
        fields={[{ key: 'comment', label: 'Comentario (opcional)' }]}
        schema={agreeReviewSchema}
        prepare={(values) => ({ comment: orNull(values['comment']) })}
        run={(body, csrfToken) =>
          api.post(`/v1/hr/performance-reviews/${review.id}/actions/agree`, {
            body,
            csrfToken,
            version: review.version,
          })
        }
        submitLabel="Aceptar"
      />
    </>
  );
}

export function MyReviews(): JSX.Element {
  const query = useHrQuery('/v1/hr/me/performance-reviews', performanceReviewListResponseSchema);
  return (
    <HrSection id="mis-evaluaciones" title="Mis evaluaciones de desempeño">
      <QueryState query={query} loadingLabel="Cargando evaluaciones">
        {({ data }) => (
          <HrList
            items={data}
            empty="Aún no tiene evaluaciones."
            keyOf={(review) => review.id}
            render={(review) => <ReviewRow review={review} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

export function MyTrainings(): JSX.Element {
  const query = useHrQuery('/v1/hr/me/trainings', trainingListResponseSchema);
  return (
    <HrSection id="mi-formacion" title="Mi formación y bienestar">
      <QueryState query={query} loadingLabel="Cargando formación">
        {({ data }) => (
          <HrList
            items={data}
            empty="No tiene formaciones programadas."
            keyOf={(training) => training.id}
            render={(training) => (
              <>
                <span>
                  <strong>{training.title}</strong> · {TRAINING_KINDS[training.kind]}
                </span>
                <span>
                  {formatDate(training.scheduled_on)} · {String(training.hours)} h
                  {training.attendees[0]?.attended === true ? ' · Asistió' : null}
                </span>
              </>
            )}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

/** Las citaciones se leen con POST: cada consulta queda en la auditoría. */
export function MyCitations(): JSX.Element | null {
  const api = useApiClient();
  const query = useQuery({
    queryKey: ['hr', 'me', 'disciplinary'],
    queryFn: () =>
      api.post('/v1/hr/me/disciplinary-cases/read', {
        body: {},
        schema: ownDisciplinaryListResponseSchema,
      }),
  });
  const cases = query.data?.data ?? [];
  if (cases.length === 0) return null;
  return (
    <HrSection id="mis-citaciones" title="Citaciones de Talento humano">
      <HrList
        items={cases}
        empty=""
        keyOf={(item) => item.id}
        render={(item) => (
          <div className="flex flex-col gap-1">
            <strong>
              {item.code}
              {item.hearing_on === null ? null : ` · Descargos el ${formatDate(item.hearing_on)}`}
            </strong>
            <span>{item.facts}</span>
            {item.decision === null ? null : (
              <span>
                Decisión: {DISCIPLINARY_DECISIONS[item.decision]}
                {item.suspension_days === null
                  ? null
                  : ` (${String(item.suspension_days)} días)`}. {item.reasoning}
              </span>
            )}
          </div>
        )}
      />
    </HrSection>
  );
}

function taskPath(task: MyTask): string {
  return task.kind === 'onboarding'
    ? `/v1/hr/me/tasks/onboarding/${task.id}/actions/complete`
    : `/v1/hr/offboardings/${task.id}/items/${task.item ?? ''}/actions/complete`;
}

function TaskRow({ task }: { readonly task: MyTask }): JSX.Element {
  const api = useApiClient();
  return (
    <>
      <span>
        <strong>{task.title}</strong> · {task.employee.name}
      </span>
      <span>{task.due_on === null ? null : `Fecha: ${formatDate(task.due_on)}`}</span>
      <HrDialogForm
        allowed
        label="Marcar hecha"
        title="Marcar la tarea como hecha"
        description={task.title}
        fields={[
          { key: 'done_on', label: 'Fecha de realización', type: 'date', value: bogotaToday() },
          { key: 'note', label: 'Observación (opcional)' },
        ]}
        schema={completeMyTaskSchema}
        prepare={(values) => ({ ...values, note: orNull(values['note']) })}
        run={(body, csrfToken) =>
          api.post(taskPath(task), { body, csrfToken, version: task.version })
        }
        submitLabel="Guardar"
      />
    </>
  );
}

export function MyTasks(): JSX.Element {
  const query = useHrQuery('/v1/hr/me/tasks', myTaskListResponseSchema);
  return (
    <HrSection id="tareas-a-mi-cargo" title="Tareas de inducción y retiro a mi cargo">
      <QueryState query={query} loadingLabel="Cargando tareas">
        {({ data }) => (
          <HrList
            items={data}
            empty="No tiene tareas pendientes."
            keyOf={(task) => `${task.id}-${task.item ?? ''}`}
            render={(task) => <TaskRow task={task} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}
