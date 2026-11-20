'use client';

import {
  PERFORMANCE_REVIEW_STATUS,
  TRAINING_KINDS,
  TRAINING_STATUS,
  cancelTrainingSchema,
  hrCreatedResponseSchema,
  performanceReviewListResponseSchema,
  recordAttendanceSchema,
  saveTrainingSchema,
  trainingListResponseSchema,
  type Training,
} from '@arza/contracts';
import { PageHeader } from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { bogotaToday } from '../crm/labels';
import { usePermissions } from '../session/permissions';
import { useActiveEmployees } from './hr-admin-absences';
import { HrDialogForm, HrList, HrSection, optionsOf, orNull } from './hr-dialog';
import type { HrField } from './hr-form';
import { useHrQuery } from './hr-queries';
import { NewReview, ScoreReview } from './review-forms';

// Desempeño, formación y bienestar para Talento humano (B36, decisión 7).

interface Option {
  readonly value: string;
  readonly label: string;
}

function trainingFields(employees: readonly Option[]): HrField[] {
  return [
    { key: 'title', label: 'Título' },
    { key: 'kind', label: 'Clase', options: optionsOf(TRAINING_KINDS) },
    { key: 'scheduled_on', label: 'Fecha', type: 'date', value: bogotaToday() },
    { key: 'hours', label: 'Duración en horas', type: 'number', value: '1' },
    { key: 'facilitator', label: 'Facilitador (opcional)' },
    {
      key: 'employee_id',
      label: 'Participantes',
      options: [{ value: ALL, label: 'Todos los colaboradores activos' }, ...employees],
    },
    { key: 'description', label: 'Descripción (opcional)' },
  ];
}

const ALL = 'todos';

function trainingBody(values: Record<string, string>, employees: readonly Option[]) {
  const chosen = values['employee_id'] ?? '';
  return {
    title: values['title'],
    kind: values['kind'],
    scheduled_on: values['scheduled_on'],
    hours: Number(values['hours']),
    facilitator: orNull(values['facilitator']),
    description: orNull(values['description']),
    employee_ids:
      chosen === ALL ? employees.map(({ value }) => value) : chosen === '' ? [] : [chosen],
  };
}

function NewTraining(): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  const employees = useActiveEmployees();
  return (
    <HrDialogForm
      allowed
      label="Programar formación"
      title="Programar una formación o actividad de bienestar"
      description="Convoque a una persona o a todos los colaboradores activos."
      fields={trainingFields(employees)}
      schema={saveTrainingSchema}
      prepare={(values) => trainingBody(values, employees)}
      run={(body, csrfToken) =>
        api.post('/v1/hr/trainings', {
          body,
          csrfToken,
          schema: hrCreatedResponseSchema,
          idempotencyKey: key,
        })
      }
      submitLabel="Programar"
    />
  );
}

function attendanceFields(training: Training): HrField[] {
  return training.attendees.flatMap((attendee) => [
    {
      key: `att_${attendee.employee.id}`,
      label: `${attendee.employee.name}: ¿asistió?`,
      options: [
        { value: 'si', label: 'Sí' },
        { value: 'no', label: 'No' },
      ],
    },
    {
      key: `eval_${attendee.employee.id}`,
      label: `${attendee.employee.name}: calificación de 1 a 5 (opcional)`,
      type: 'number' as const,
    },
  ]);
}

function attendanceBody(training: Training, values: Record<string, string>) {
  return {
    attendance: training.attendees.map(({ employee }) => {
      const attended = values[`att_${employee.id}`] === 'si';
      const score = values[`eval_${employee.id}`] ?? '';
      return {
        employee_id: employee.id,
        attended,
        evaluation: attended && score !== '' ? Number(score) : null,
      };
    }),
  };
}

function TrainingActions({ training }: { readonly training: Training }): JSX.Element | null {
  const api = useApiClient();
  if (training.status !== 'scheduled') return null;
  const path = `/v1/hr/trainings/${training.id}/actions`;
  const post = (action: string, body: object, csrfToken: string) =>
    api.post(`${path}/${action}`, { body, csrfToken, version: training.version });
  return (
    <div className="flex flex-wrap gap-2">
      <HrDialogForm
        allowed={training.scheduled_on <= bogotaToday()}
        label="Registrar asistencia"
        title={`Asistencia a ${training.title}`}
        description="Indique si cada persona asistió y, si asistió, su calificación."
        fields={attendanceFields(training)}
        schema={recordAttendanceSchema}
        prepare={(values) => attendanceBody(training, values)}
        run={(body, csrfToken) => post('attendance', body, csrfToken)}
        submitLabel="Guardar asistencia"
      />
      <HrDialogForm
        allowed
        label="Cancelar"
        title={`Cancelar ${training.title}`}
        description="Indique el motivo."
        fields={[{ key: 'reason', label: 'Motivo' }]}
        schema={cancelTrainingSchema}
        run={(body, csrfToken) => post('cancel', body, csrfToken)}
        submitLabel="Cancelar formación"
      />
    </div>
  );
}

function Trainings(): JSX.Element {
  const query = useHrQuery('/v1/hr/trainings', trainingListResponseSchema);
  return (
    <HrSection id="formacion" title="Formación y bienestar">
      <NewTraining />
      <QueryState query={query} loadingLabel="Cargando formación">
        {({ data }) => (
          <HrList
            items={data}
            empty="No hay formaciones programadas."
            keyOf={(training) => training.id}
            render={(training) => (
              <>
                <span>
                  <strong>{training.title}</strong> · {training.code} ·{' '}
                  {TRAINING_KINDS[training.kind]}
                </span>
                <span>
                  {formatDate(training.scheduled_on)} · {TRAINING_STATUS[training.status]} ·{' '}
                  {String(training.attendees.length)} convocados
                </span>
                <TrainingActions training={training} />
              </>
            )}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

function Reviews(): JSX.Element {
  const query = useHrQuery('/v1/hr/performance-reviews', performanceReviewListResponseSchema);
  const employees = useActiveEmployees();
  return (
    <HrSection id="desempeno" title="Evaluaciones de desempeño">
      <NewReview employees={employees.map(({ value, label }) => ({ id: value, name: label }))} />
      <QueryState query={query} loadingLabel="Cargando evaluaciones">
        {({ data }) => (
          <HrList
            items={data}
            empty="No hay evaluaciones registradas."
            keyOf={(review) => review.id}
            render={(review) => (
              <>
                <span>
                  <strong>{review.employee.name}</strong> · periodo {review.period} ·{' '}
                  {PERFORMANCE_REVIEW_STATUS[review.status]}
                  {review.score === null ? null : ` · ${review.score.replace('.', ',')} de 5`}
                </span>
                <ScoreReview review={review} />
              </>
            )}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

export function DevelopmentAdmin(): JSX.Element {
  const { can } = usePermissions();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Desempeño y formación" />
      {can('hr.performance.manage') ? <Reviews /> : null}
      {can('hr.training.manage') ? <Trainings /> : null}
    </div>
  );
}
