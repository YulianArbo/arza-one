'use client';

import {
  REVIEW_STATUSES,
  createManagementReviewSchema,
  managementReviewListResponseSchema,
  qmsCodeResponseSchema,
  type ManagementReviewSummary,
} from '@arza/contracts';
import { Badge, PageHeader } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrDialogForm, HrList, HrSection } from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { QMS_REFRESH, bogotaToday, useQmsQuery } from './quality-queries';

// Revisión por la dirección (B39; RE-SGC-007): Calidad crea el acta del periodo, la prepara con
// las entradas precargadas y la envía; la Dirección la aprueba (decisión 5).

export const REVIEW_TONE = { draft: 'info', submitted: 'warning', approved: 'success' } as const;

function CreateReview(): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const year = bogotaToday().slice(0, 4);
  return (
    <HrDialogForm
      allowed={canAll('qms.review.manage')}
      label="Crear acta"
      title="Crear el acta de revisión por la dirección"
      description="Indique el periodo que se revisa, la fecha de la reunión y los asistentes."
      fields={[
        { key: 'period_from', label: 'Desde', type: 'date', value: `${year}-01-01` },
        { key: 'period_to', label: 'Hasta', type: 'date', value: bogotaToday() },
        { key: 'meeting_on', label: 'Fecha de la reunión', type: 'date' },
        { key: 'attendees', label: 'Asistentes y cargos' },
      ]}
      schema={createManagementReviewSchema}
      run={(body, csrfToken) =>
        api.post('/v1/qms/management-reviews', { body, csrfToken, schema: qmsCodeResponseSchema })
      }
      submitLabel="Crear"
      refresh={QMS_REFRESH}
    />
  );
}

function ReviewRow({ review }: { readonly review: ManagementReviewSummary }): JSX.Element {
  return (
    <>
      <span className="flex flex-col gap-1">
        <span>
          <strong>{review.code}</strong> · del {formatDate(review.period_from)} al{' '}
          {formatDate(review.period_to)}
        </span>
        <span className="text-muted-foreground">Reunión: {formatDate(review.meeting_on)}</span>
        <Badge tone={REVIEW_TONE[review.status]}>{REVIEW_STATUSES[review.status]}</Badge>
      </span>
      <Link className="text-sm underline" href={`/app/calidad/revision-direccion/${review.id}`}>
        Abrir {review.code}
      </Link>
    </>
  );
}

export function QualityReviews(): JSX.Element {
  const query = useQmsQuery('/v1/qms/management-reviews', managementReviewListResponseSchema);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Revisión por la dirección"
        description="RE-SGC-007: entradas precargadas desde la plataforma, conclusiones y decisiones."
      />
      <div>
        <CreateReview />
      </div>
      <HrSection id="actas" title="Actas">
        <QueryState query={query} loadingLabel="Cargando las actas">
          {({ data }) => (
            <HrList
              items={data}
              empty="Aún no hay actas de revisión por la dirección."
              keyOf={(item) => item.id}
              render={(item) => <ReviewRow review={item} />}
            />
          )}
        </QueryState>
      </HrSection>
    </div>
  );
}
