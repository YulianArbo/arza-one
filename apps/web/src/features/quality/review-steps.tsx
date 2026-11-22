'use client';

import {
  REVIEW_INPUTS,
  downloadLinkResponseSchema,
  returnManagementReviewSchema,
  updateManagementReviewSchema,
  type ManagementReview,
  type ReviewInputKey,
  type UpdateManagementReview,
} from '@arza/contracts';
import type { JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { HrActionButton, HrDialogForm, orNull } from '../hr/hr-dialog';
import type { HrField } from '../hr/hr-form';
import { usePermissions } from '../session/permissions';
import { QMS_REFRESH, useQmsPeople } from './quality-queries';

// Los pasos del acta (B39): Calidad precarga, comenta, concluye, agrega decisiones y envía; la
// Dirección la devuelve o la aprueba (decisión 5). Cada cambio guarda el acta completa.

interface ReviewProps {
  readonly review: ManagementReview;
}

/** El cuerpo completo del acta tal como está, con el cambio pedido. */
export function reviewBody(
  review: ManagementReview,
  change: Partial<UpdateManagementReview> = {},
): UpdateManagementReview {
  return {
    attendees: review.attendees,
    comments: review.inputs.map((input) => ({ key: input.key, comment: input.comment })),
    conclusions: review.conclusions,
    decisions: review.decisions.map((decision) => ({
      description: decision.description,
      responsible_id: decision.responsible.id,
      due_on: decision.due_on,
    })),
    ...change,
  };
}

function useDraft(review: ManagementReview): boolean {
  const { canAll } = usePermissions();
  return canAll('qms.review.manage') && review.status === 'draft';
}

function SaveReview(props: {
  readonly review: ManagementReview;
  readonly label: string;
  readonly title: string;
  readonly fields: readonly HrField[];
  readonly change: (values: Record<string, string>) => Partial<UpdateManagementReview>;
}): JSX.Element | null {
  const api = useApiClient();
  return (
    <HrDialogForm
      allowed={useDraft(props.review)}
      label={props.label}
      title={props.title}
      description="El acta se guarda completa; puede volver a editarla mientras esté en preparación."
      fields={props.fields}
      schema={updateManagementReviewSchema}
      prepare={(values) => reviewBody(props.review, props.change(values))}
      run={(body, csrfToken) =>
        api.patch(`/v1/qms/management-reviews/${props.review.id}`, {
          body,
          csrfToken,
          version: props.review.version,
        })
      }
      submitLabel="Guardar"
      refresh={QMS_REFRESH}
    />
  );
}

export function EditConclusions({ review }: ReviewProps): JSX.Element | null {
  return (
    <SaveReview
      review={review}
      label="Asistentes y conclusiones"
      title="Asistentes y conclusiones"
      fields={[
        { key: 'attendees', label: 'Asistentes y cargos', value: review.attendees },
        {
          key: 'conclusions',
          label: 'Conclusiones: conveniencia, adecuación y eficacia del sistema',
          value: review.conclusions ?? '',
        },
      ]}
      change={(values) => ({
        attendees: values['attendees'] ?? '',
        conclusions: orNull(values['conclusions']),
      })}
    />
  );
}

export function CommentInput(props: {
  readonly review: ManagementReview;
  readonly inputKey: ReviewInputKey;
  readonly comment: string | null;
}): JSX.Element | null {
  const title = REVIEW_INPUTS[props.inputKey].title;
  return (
    <SaveReview
      review={props.review}
      label={`Comentar: ${title}`}
      title={title}
      fields={[{ key: 'comment', label: 'Comentario o análisis', value: props.comment ?? '' }]}
      change={(values) => ({
        comments: [{ key: props.inputKey, comment: orNull(values['comment']) }],
      })}
    />
  );
}

export function AddDecision({ review }: ReviewProps): JSX.Element | null {
  const people = useQmsPeople(useDraft(review));
  const current = reviewBody(review).decisions;
  return (
    <SaveReview
      review={review}
      label="Agregar decisión"
      title="Agregar una decisión"
      fields={[
        { key: 'description', label: 'Decisión' },
        { key: 'responsible_id', label: 'Responsable', options: people },
        { key: 'due_on', label: 'Fecha compromiso', type: 'date' },
      ]}
      change={(values) => ({
        decisions: [
          ...current,
          {
            description: values['description'] ?? '',
            responsible_id: values['responsible_id'] ?? '',
            due_on: values['due_on'] ?? '',
          },
        ],
      })}
    />
  );
}

function StepButton(props: {
  readonly review: ManagementReview;
  readonly step: 'load-inputs' | 'submit' | 'approve';
  readonly label: string;
  readonly pending: string;
}): JSX.Element {
  const api = useApiClient();
  return (
    <HrActionButton
      label={props.label}
      pendingLabel={props.pending}
      ariaLabel={`${props.label} ${props.review.code}`}
      run={(csrfToken) =>
        api.post(`/v1/qms/management-reviews/${props.review.id}/actions/${props.step}`, {
          body: {},
          csrfToken,
          version: props.review.version,
        })
      }
      refresh={QMS_REFRESH}
    />
  );
}

export function ReviewSteps({ review }: ReviewProps): JSX.Element {
  const { canAll } = usePermissions();
  const draft = useDraft(review);
  const approver = canAll('qms.review.approve') && review.status === 'submitted';
  return (
    <div className="flex flex-wrap gap-3">
      {draft ? (
        <StepButton
          review={review}
          step="load-inputs"
          label="Precargar entradas"
          pending="Precargando…"
        />
      ) : null}
      {draft ? (
        <StepButton
          review={review}
          step="submit"
          label="Enviar a la Dirección"
          pending="Enviando…"
        />
      ) : null}
      {approver ? (
        <StepButton review={review} step="approve" label="Aprobar acta" pending="Aprobando…" />
      ) : null}
      <ReturnReview review={review} />
      <ReviewPdf review={review} />
    </div>
  );
}

function ReturnReview({ review }: ReviewProps): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  return (
    <HrDialogForm
      allowed={canAll('qms.review.approve') && review.status === 'submitted'}
      label="Devolver a Calidad"
      title={`Devolver ${review.code}`}
      description="Indique qué falta; Calidad lo ajusta y la envía de nuevo."
      fields={[{ key: 'reason', label: 'Motivo' }]}
      schema={returnManagementReviewSchema}
      run={(body, csrfToken) =>
        api.post(`/v1/qms/management-reviews/${review.id}/actions/return`, {
          body,
          csrfToken,
          version: review.version,
        })
      }
      submitLabel="Devolver"
      refresh={QMS_REFRESH}
    />
  );
}

function ReviewPdf({ review }: ReviewProps): JSX.Element | null {
  const api = useApiClient();
  if (review.document_id === null) return null;
  return (
    <HrActionButton
      label="Descargar acta (PDF)"
      pendingLabel="Preparando…"
      ariaLabel={`Descargar el acta ${review.code}`}
      run={async (csrfToken) => {
        const link = await api.post(`/v1/qms/management-reviews/${review.id}/download-link`, {
          body: {},
          csrfToken,
          schema: downloadLinkResponseSchema,
        });
        window.open(link.url, '_self');
      }}
    />
  );
}
