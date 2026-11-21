'use client';

import {
  lessonListResponseSchema,
  qmsCreatedResponseSchema,
  saveLessonSchema,
  type Lesson,
} from '@arza/contracts';
import { PageHeader } from '@arza/ui';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection, orNull } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { QMS_REFRESH, useQmsProcesses, useQmsQuery } from './quality-queries';

// Lecciones aprendidas (B38, ficha 17.15): las registra Calidad y las lee todo el personal.

function NewLesson(): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const allowed = canAll('qms.process.manage');
  const processes = useQmsProcesses(allowed);
  return (
    <HrDialogForm
      allowed={allowed}
      label="Registrar lección"
      title="Registrar una lección aprendida"
      description="Qué pasó, qué aprendimos y qué haremos distinto."
      fields={[
        { key: 'title', label: 'Título' },
        { key: 'context', label: 'Qué pasó' },
        { key: 'lesson', label: 'Qué aprendimos y qué haremos distinto' },
        { key: 'process_id', label: 'Proceso (opcional)', options: processes },
      ]}
      schema={saveLessonSchema}
      prepare={(values) => ({
        ...values,
        process_id: orNull(values['process_id']),
        nonconformity_id: null,
      })}
      run={(body, csrfToken) =>
        api.post('/v1/qms/lessons', { body, csrfToken, schema: qmsCreatedResponseSchema })
      }
      submitLabel="Registrar"
      refresh={QMS_REFRESH}
    />
  );
}

function LessonRow({ item }: { readonly item: Lesson }): JSX.Element {
  return (
    <span className="flex flex-col gap-1">
      <strong>{item.title}</strong>
      <span>Qué pasó: {item.context}</span>
      <span>Lección: {item.lesson}</span>
      <span className="text-muted-foreground">
        {item.process === null ? '' : `${item.process.name} · `}
        {item.nonconformity === null ? '' : `${item.nonconformity.code} · `}
        {item.recorded_by.name} · {formatDate(item.recorded_on)}
      </span>
    </span>
  );
}

export function QualityLessons(): JSX.Element {
  const query = useQmsQuery('/v1/qms/lessons', lessonListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Lecciones aprendidas"
        description="Lo que aprendimos para no repetirlo. Las lee todo el personal."
      />
      <HrSection id="lecciones" title="Lecciones">
        <NewLesson />
        <QueryState query={query} loadingLabel="Cargando las lecciones">
          {({ data }) => (
            <HrList
              items={data}
              empty="Aún no hay lecciones registradas."
              keyOf={(item) => item.id}
              render={(item) => <LessonRow item={item} />}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
