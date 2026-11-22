'use client';

import {
  REVIEW_INPUTS,
  REVIEW_STATUSES,
  managementReviewSchema,
  type ManagementReview,
  type ReviewInput,
} from '@arza/contracts';
import { Badge, PageHeader } from '@arza/ui';
import type { JSX } from 'react';

import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrList, HrSection } from '../hr/hr-dialog';
import { useQmsQuery } from './quality-queries';
import { REVIEW_TONE } from './quality-reviews';
import { AddDecision, CommentInput, EditConclusions, ReviewSteps } from './review-steps';

// El acta de revisión por la dirección (B39; RE-SGC-007): entradas precargadas con su comentario,
// conclusiones, decisiones con responsable y fecha y, al aprobarse, la acción de cada decisión.

function InputSection(props: {
  readonly review: ManagementReview;
  readonly input: ReviewInput;
}): JSX.Element {
  const { input } = props;
  const manual = REVIEW_INPUTS[input.key].manual;
  return (
    <HrSection id={`entrada-${input.key}`} title={input.title}>
      {input.lines.length === 0 ? (
        <p className="text-muted-foreground">
          {manual
            ? 'La plataforma no tiene este dato: escríbalo en el comentario.'
            : 'Pulse «Precargar entradas» para traer las cifras del periodo.'}
        </p>
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          {input.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
      {input.comment === null ? null : <p>{input.comment}</p>}
      <div>
        <CommentInput review={props.review} inputKey={input.key} comment={input.comment} />
      </div>
    </HrSection>
  );
}

function Decisions({ review }: { readonly review: ManagementReview }): JSX.Element {
  return (
    <HrSection id="decisiones" title="Decisiones y acciones">
      <div>
        <AddDecision review={review} />
      </div>
      <HrList
        items={review.decisions}
        empty="Aún no hay decisiones."
        keyOf={(item) => `${item.description}-${item.due_on}`}
        render={(item) => (
          <span className="flex flex-col gap-1">
            <span>{item.description}</span>
            <span className="text-muted-foreground">
              {item.responsible.name} · {formatDate(item.due_on)}
              {item.action === null ? '' : ` · acción ${item.action.code}`}
            </span>
          </span>
        )}
      />
    </HrSection>
  );
}

function Review({ review }: { readonly review: ManagementReview }): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Acta ${review.code}`}
        description={`Periodo del ${formatDate(review.period_from)} al ${formatDate(review.period_to)} · reunión el ${formatDate(review.meeting_on)}`}
      />
      <Badge tone={REVIEW_TONE[review.status]}>{REVIEW_STATUSES[review.status]}</Badge>
      {review.return_reason === null || review.status !== 'draft' ? null : (
        <p role="status">La Dirección la devolvió: {review.return_reason}</p>
      )}
      <p>Asistentes: {review.attendees}</p>
      {review.approved_by === null || review.approved_on === null ? null : (
        <p>
          Aprobó {review.approved_by.name} el {formatDate(review.approved_on)}.
        </p>
      )}
      <ReviewSteps review={review} />
      <h2 className="text-section font-semibold">Entradas de la revisión</h2>
      {review.inputs.map((input) => (
        <InputSection key={input.key} review={review} input={input} />
      ))}
      <HrSection id="conclusiones" title="Conclusiones">
        <p>{review.conclusions ?? 'Aún no hay conclusiones.'}</p>
        <div>
          <EditConclusions review={review} />
        </div>
      </HrSection>
      <Decisions review={review} />
    </div>
  );
}

export function QualityReviewDetail({ id }: { readonly id: string }): JSX.Element {
  const query = useQmsQuery(`/v1/qms/management-reviews/${id}`, managementReviewSchema);
  return (
    <QueryState query={query} loadingLabel="Cargando el acta">
      {(review) => <Review review={review} />}
    </QueryState>
  );
}
