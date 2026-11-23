import type { PersonalDataRecord } from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  outcomeFor,
  shownDateTime,
  type PersonalDataHolder,
  type PersonalDataSource,
} from '../../privacy/index.js';

// Lo que Servicio al cliente guarda de un titular, para Privacidad (B42, decisión 8): sus
// tiquetes, sus PQRSF y sus respuestas a las encuestas, por su ficha o por el correo con que
// escribió. Al suprimir se borran el nombre, el correo y el teléfono de quien los presentó y los
// comentarios de las encuestas; el asunto y el trámite quedan como registro del servicio.

const ANONYMOUS = 'Titular suprimido';

function byHolder(holder: PersonalDataHolder) {
  return [{ partyId: holder.partyId }, { requesterEmail: { in: [...holder.emails] } }];
}

function surveysOf(holder: PersonalDataHolder): Prisma.SvcSurveyResponseWhereInput {
  return {
    deletedAt: null,
    OR: [{ partyId: holder.partyId }, { recipientEmail: { in: [...holder.emails] } }],
  };
}

async function ticketRecords(
  tx: TenantTransaction,
  holder: PersonalDataHolder,
): Promise<PersonalDataRecord[]> {
  const tickets = await tx.svcTicket.findMany({
    where: { deletedAt: null, OR: byHolder(holder) },
    orderBy: { createdAt: 'asc' },
  });
  return tickets.map((row) => ({
    title: `Tiquete ${row.code}`,
    fields: [
      { label: 'Asunto', value: row.subject },
      { label: 'Registrado', value: shownDateTime(row.createdAt) },
      { label: 'Quién lo pidió', value: row.requesterName },
      { label: 'Correo', value: row.requesterEmail },
      { label: 'Estado', value: row.status },
    ],
  }));
}

async function pqrsfRecords(
  tx: TenantTransaction,
  holder: PersonalDataHolder,
): Promise<PersonalDataRecord[]> {
  const rows = await tx.svcPqrsf.findMany({
    where: { deletedAt: null, OR: byHolder(holder) },
    orderBy: { receivedAt: 'asc' },
  });
  return rows.map((row) => ({
    title: `PQRSF ${row.code}`,
    fields: [
      { label: 'Asunto', value: row.subject },
      { label: 'Radicada', value: shownDateTime(row.receivedAt) },
      { label: 'Quién la presentó', value: row.requesterName },
      { label: 'Correo', value: row.requesterEmail },
      { label: 'Teléfono', value: row.requesterPhone },
      { label: 'Estado', value: row.status },
    ],
  }));
}

async function surveyRecords(
  tx: TenantTransaction,
  holder: PersonalDataHolder,
): Promise<PersonalDataRecord[]> {
  const surveys = await tx.svcSurveyResponse.findMany({
    where: { ...surveysOf(holder), answeredAt: { not: null } },
    orderBy: { createdAt: 'asc' },
  });
  return surveys.map((row) => ({
    title: 'Respuesta a una encuesta de satisfacción',
    fields: [
      { label: 'Respondida', value: shownDateTime(row.answeredAt) },
      { label: 'Calificación', value: row.score === null ? null : String(row.score) },
      { label: 'Comentario', value: row.comment },
    ],
  }));
}

export const SERVICE_PERSONAL_DATA: PersonalDataSource = {
  key: 'service',
  title: 'Servicio al cliente',
  async collect(tx, holder) {
    return [
      ...(await ticketRecords(tx, holder)),
      ...(await pqrsfRecords(tx, holder)),
      ...(await surveyRecords(tx, holder)),
    ];
  },
  async erase(tx, holder) {
    const tickets = await tx.svcTicket.updateMany({
      where: { deletedAt: null, OR: byHolder(holder) },
      data: { requesterName: ANONYMOUS, requesterEmail: null },
    });
    const pqrsf = await tx.svcPqrsf.updateMany({
      where: { deletedAt: null, OR: byHolder(holder) },
      data: { requesterName: ANONYMOUS, requesterEmail: null, requesterPhone: null },
    });
    const surveys = await tx.svcSurveyResponse.updateMany({
      where: surveysOf(holder),
      data: { recipientEmail: null, comment: null },
    });
    return outcomeFor(tickets.count + pqrsf.count + surveys.count, 'erased');
  },
};
