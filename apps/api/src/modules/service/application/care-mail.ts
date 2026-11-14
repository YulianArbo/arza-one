import { PQRSF_TYPES, pqrsfTypeSchema, SURVEY_RULES } from '@arza/contracts';
import { printedDate } from '@arza/templates';

import type { SvcPqrsf, SvcTicket } from '../../../generated/prisma/client.js';
import { bogotaToday, toCalendarDate, type CompanyIdentity } from '../../core/index.js';

// Los correos de Servicio al cliente a personas de fuera (B29): el acuse de la PQRSF con su radicado
// y su fecha límite, la respuesta aprobada y la invitación a la encuesta. La llave del enlace de la
// encuesta solo existe en el correo: va después de «#», que el navegador no envía al servidor.

export interface CareMail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

function closing(company: CompanyIdentity): string {
  return `${company.legalName} · NIT ${company.taxId}\nEste es un correo automático de ARZA ONE; no lo responda.`;
}

function typeLabel(pqrsf: SvcPqrsf): string {
  return PQRSF_TYPES[pqrsfTypeSchema.parse(pqrsf.type)].toLowerCase();
}

/** La página pública para consultar el estado de una PQRSF. */
function pqrsfStatusUrl(appUrl: string): string {
  return new URL('/pqrsf/consulta', appUrl).toString();
}

/** La página pública de la encuesta, con la llave después de «#». */
export function surveyUrl(appUrl: string, token: string): string {
  const url = new URL('/encuesta', appUrl);
  url.hash = `token=${token}`;
  return url.toString();
}

export function ackMail(pqrsf: SvcPqrsf, company: CompanyIdentity, appUrl: string): CareMail {
  return {
    to: pqrsf.requesterEmail ?? '',
    subject: `Radicamos su ${typeLabel(pqrsf)}: ${pqrsf.code}`,
    text: [
      `Hola, ${pqrsf.requesterName}:`,
      `${company.legalName} recibió su ${typeLabel(pqrsf)} «${pqrsf.subject}» el ${printedDate(bogotaToday(pqrsf.receivedAt))}.`,
      `Su número de radicado es ${pqrsf.code}. Guárdelo: lo necesita para consultar el estado.`,
      `Le responderemos a más tardar el ${printedDate(toCalendarDate(pqrsf.dueOn))}.`,
      'Puede consultar el estado cuando quiera en esta página, con su radicado y este correo:',
      pqrsfStatusUrl(appUrl),
      closing(company),
    ].join('\n\n'),
  };
}

export function responseMail(pqrsf: SvcPqrsf, company: CompanyIdentity): CareMail {
  return {
    to: pqrsf.requesterEmail ?? '',
    subject: `Respuesta a su ${typeLabel(pqrsf)} ${pqrsf.code}`,
    text: [
      `Hola, ${pqrsf.requesterName}:`,
      `Esta es la respuesta de ${company.legalName} a su ${typeLabel(pqrsf)} ${pqrsf.code} («${pqrsf.subject}»):`,
      pqrsf.response ?? '',
      'Si tiene preguntas sobre esta respuesta, puede presentar una nueva solicitud en nuestro sitio.',
      closing(company),
    ].join('\n\n'),
  };
}

export function surveyMail(
  to: string,
  ticket: Pick<SvcTicket, 'code' | 'subject'>,
  company: CompanyIdentity,
  url: string,
): CareMail {
  return {
    to,
    subject: `¿Cómo le fue con su solicitud ${ticket.code}?`,
    text: [
      'Hola:',
      `${company.legalName} resolvió su solicitud ${ticket.code} («${ticket.subject}»). Queremos saber cómo le fue.`,
      'Son dos preguntas y un comentario opcional; le toma menos de un minuto:',
      url,
      `El enlace es personal y vale ${String(SURVEY_RULES.linkDays)} días. Si recibe otro correo para esta misma solicitud, use el más reciente.`,
      closing(company),
    ].join('\n\n'),
  };
}
