import { OFFBOARDING_ITEMS, offboardingItemSchema } from '@arza/contracts';
import { z } from 'zod';

import type { Handler, Notice } from './notice-types.js';

// Avisos de Talento humano del B36: al jefe (o a Talento humano si no hay jefe) cuando le piden una
// ausencia u horas extras, al colaborador cuando le responden, cuando su evaluación está lista y
// cuando lo citan a descargos, y a cada responsable de una tarea de un retiro. Los eventos solo
// traen identificadores y los destinatarios: el aviso no lleva datos del caso.

const recipientsSchema = z.object({ recipients: z.array(z.uuid()).default([]) });

/** AAAA-MM-DD como se muestra en Colombia: dd/mm/aaaa. */
function shownDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/** Un aviso igual para cada destinatario, salvo para quien causó el evento. */
function toEach(
  recipients: readonly string[],
  actorId: string | null,
  notice: Omit<Notice, 'userId'>,
): Notice[] {
  return recipients.filter((id) => id !== actorId).map((userId) => ({ userId, ...notice }));
}

const LEAVE_NEWS: Readonly<Record<string, string>> = {
  requested: 'Un colaborador de su equipo solicitó una ausencia que debe decidir',
  approved: 'Su solicitud de ausencia fue aprobada',
  rejected: 'Su solicitud de ausencia fue rechazada',
};

const OVERTIME_NEWS: Readonly<Record<string, string>> = {
  requested: 'Hay horas extras por autorizar de su equipo',
  authorized: 'Sus horas extras fueron autorizadas',
  rejected: 'Sus horas extras no fueron autorizadas',
};

const decisionSchema = recipientsSchema.extend({ decision: z.string() });

function newsHandler(
  kind: 'hr_leave_update' | 'hr_overtime_update',
  news: Readonly<Record<string, string>>,
): Handler {
  return (_tx, event) => {
    const payload = decisionSchema.parse(event.payload);
    const novedad = news[payload.decision];
    if (novedad === undefined) return Promise.resolve([]);
    const link = payload.decision === 'requested' ? '/app/mi-espacio/equipo' : '/app/mi-espacio';
    return Promise.resolve(
      toEach(payload.recipients, event.actorId, { kind, values: { novedad }, link }),
    );
  };
}

const onReviewScored: Handler = (_tx, event) => {
  const payload = recipientsSchema.parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, event.actorId, {
      kind: 'hr_review_update',
      values: {},
      link: '/app/mi-espacio',
    }),
  );
};

const onCited: Handler = (_tx, event) => {
  const payload = recipientsSchema.extend({ hearing_on: z.iso.date() }).parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, event.actorId, {
      kind: 'hr_disciplinary_notice',
      values: { fecha: shownDate(payload.hearing_on) },
      link: '/app/mi-espacio',
    }),
  );
};

const offboardingSchema = z.object({
  last_day: z.iso.date(),
  tasks: z.array(z.object({ item: offboardingItemSchema, responsible_id: z.uuid().nullable() })),
});

const onOffboardingStarted: Handler = (_tx, event) => {
  const payload = offboardingSchema.parse(event.payload);
  const notices: Notice[] = [];
  for (const task of payload.tasks) {
    if (task.responsible_id === null || task.responsible_id === event.actorId) continue;
    notices.push({
      userId: task.responsible_id,
      kind: 'hr_offboarding_task',
      values: { tarea: OFFBOARDING_ITEMS[task.item].label, fecha: shownDate(payload.last_day) },
      link: '/app/mi-espacio',
    });
  }
  return Promise.resolve(notices);
};

export const HR_PEOPLE_HANDLERS: Readonly<Record<string, Handler>> = {
  'hr.leave.requested': newsHandler('hr_leave_update', LEAVE_NEWS),
  'hr.leave.decided': newsHandler('hr_leave_update', LEAVE_NEWS),
  'hr.overtime.requested': newsHandler('hr_overtime_update', OVERTIME_NEWS),
  'hr.overtime.decided': newsHandler('hr_overtime_update', OVERTIME_NEWS),
  'hr.review.scored': onReviewScored,
  'hr.disciplinary.cited': onCited,
  'hr.offboarding.started': onOffboardingStarted,
};
