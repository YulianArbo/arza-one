import { NONCONFORMITY_SOURCES, nonconformitySourceSchema } from '@arza/contracts';
import { z } from 'zod';

import type { Handler, Notice } from './notice-types.js';

// Avisos de Calidad y mejora continua (B38 y B39). Los eventos traen los destinatarios y lo mínimo para
// el texto: el código y, si aplica, la fecha.

const recipientsSchema = z.object({ recipients: z.array(z.uuid()).default([]) });

/** AAAA-MM-DD como se muestra en Colombia: dd/mm/aaaa. */
function shownDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

function toEach(
  recipients: readonly string[],
  actorId: string | null,
  notice: Omit<Notice, 'userId'>,
): Notice[] {
  return recipients.filter((id) => id !== actorId).map((userId) => ({ userId, ...notice }));
}

const QMS_LINK = '/app/calidad';

const onReported: Handler = (_tx, event) => {
  const payload = recipientsSchema
    .extend({ code: z.string(), source: nonconformitySourceSchema })
    .parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, event.actorId, {
      kind: 'qms_nonconformity_reported',
      values: { codigo: payload.code, origen: NONCONFORMITY_SOURCES[payload.source].toLowerCase() },
      link: `${QMS_LINK}/no-conformidades`,
    }),
  );
};

const onAssigned: Handler = (_tx, event) => {
  const payload = recipientsSchema
    .extend({ code: z.string(), due_on: z.iso.date() })
    .parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, event.actorId, {
      kind: 'qms_action_assigned',
      values: { codigo: payload.code, fecha: shownDate(payload.due_on) },
      link: '/app/mi-espacio',
    }),
  );
};

const onExecuted: Handler = (_tx, event) => {
  const payload = recipientsSchema.extend({ code: z.string() }).parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, event.actorId, {
      kind: 'qms_action_to_verify',
      values: { codigo: payload.code },
      link: `${QMS_LINK}/acciones`,
    }),
  );
};

const onOverdue: Handler = (_tx, event) => {
  const payload = recipientsSchema
    .extend({ code: z.string(), due_on: z.iso.date() })
    .parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, null, {
      kind: 'qms_action_overdue',
      values: { codigo: payload.code, fecha: shownDate(payload.due_on) },
      link: `${QMS_LINK}/acciones`,
    }),
  );
};

// Auditorías, indicadores y revisión por la dirección (B39, decisión 11).

const onAuditAssigned: Handler = (_tx, event) => {
  const payload = recipientsSchema
    .extend({ code: z.string(), planned_on: z.iso.date() })
    .parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, event.actorId, {
      kind: 'qms_audit_assigned',
      values: { codigo: payload.code, fecha: shownDate(payload.planned_on) },
      link: '/app/mi-espacio',
    }),
  );
};

const onIndicatorDue: Handler = (_tx, event) => {
  const payload = recipientsSchema
    .extend({ code: z.string(), period: z.string() })
    .parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, null, {
      kind: 'qms_indicator_due',
      values: { codigo: payload.code, periodo: payload.period },
      link: '/app/mi-espacio',
    }),
  );
};

const onReviewSubmitted: Handler = (_tx, event) => {
  const payload = recipientsSchema.extend({ code: z.string() }).parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, event.actorId, {
      kind: 'qms_review_to_approve',
      values: { codigo: payload.code },
      link: `${QMS_LINK}/revision-direccion`,
    }),
  );
};

// Normograma (B46, decisión 8): requisitos sin evaluar cerca del fin del semestre.
const onLegalDue: Handler = (_tx, event) => {
  const payload = recipientsSchema
    .extend({ count: z.number().int().positive(), period: z.string(), ends_on: z.iso.date() })
    .parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, null, {
      kind: 'qms_legal_due',
      values: {
        cantidad: String(payload.count),
        periodo: payload.period,
        fecha: shownDate(payload.ends_on),
      },
      link: '/app/direccion/normograma',
    }),
  );
};

export const QMS_HANDLERS: Readonly<Record<string, Handler>> = {
  'qms.nonconformity.reported': onReported,
  'qms.action.assigned': onAssigned,
  'qms.action.executed': onExecuted,
  'qms.action.overdue': onOverdue,
  'qms.audit.assigned': onAuditAssigned,
  'qms.indicator.due': onIndicatorDue,
  'qms.review.submitted': onReviewSubmitted,
  'qms.legal.due': onLegalDue,
};
