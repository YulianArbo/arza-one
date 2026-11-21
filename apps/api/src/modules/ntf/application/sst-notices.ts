import { QUICK_REPORT_KINDS, quickReportKindSchema } from '@arza/contracts';
import { z } from 'zod';

import type { Handler, Notice } from './notice-types.js';

// Avisos de Seguridad y salud en el trabajo (B37). Los eventos traen los destinatarios y lo mínimo
// para el texto: nunca datos de salud ni el contenido de una queja de convivencia.

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

const SST_LINK = '/app/talento-y-sst/sst';

const onReport: Handler = (_tx, event) => {
  const payload = recipientsSchema
    .extend({ kind: quickReportKindSchema, location: z.string() })
    .parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, event.actorId, {
      kind: 'sst_report_received',
      values: { reporte: QUICK_REPORT_KINDS[payload.kind].toLowerCase(), lugar: payload.location },
      link: SST_LINK,
    }),
  );
};

const onArlDue: Handler = (_tx, event) => {
  const payload = recipientsSchema
    .extend({ code: z.string(), due_on: z.iso.date() })
    .parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, null, {
      kind: 'sst_arl_due',
      values: { codigo: payload.code, fecha: shownDate(payload.due_on) },
      link: `${SST_LINK}/incidentes`,
    }),
  );
};

const onExamDue: Handler = (_tx, event) => {
  const payload = recipientsSchema.extend({ due_on: z.iso.date() }).parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, null, {
      kind: 'sst_exam_due',
      values: { fecha: shownDate(payload.due_on) },
      link: `${SST_LINK}/salud`,
    }),
  );
};

const onTask: Handler = (_tx, event) => {
  const payload = recipientsSchema
    .extend({ task: z.string(), due_on: z.iso.date(), link: z.string().default('/app/mi-espacio') })
    .parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, event.actorId, {
      kind: 'sst_task_assigned',
      values: { tarea: payload.task, fecha: shownDate(payload.due_on) },
      link: payload.link,
    }),
  );
};

const onComplaint: Handler = (_tx, event) => {
  const payload = recipientsSchema.extend({ code: z.string() }).parse(event.payload);
  return Promise.resolve(
    toEach(payload.recipients, event.actorId, {
      kind: 'sst_complaint_received',
      values: { codigo: payload.code },
      link: `${SST_LINK}/comites`,
    }),
  );
};

export const SST_HANDLERS: Readonly<Record<string, Handler>> = {
  'sst.report.received': onReport,
  'sst.arl.due': onArlDue,
  'sst.exam.due': onExamDue,
  'sst.task.assigned': onTask,
  'sst.complaint.received': onComplaint,
};
