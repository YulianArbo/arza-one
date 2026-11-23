import { z } from 'zod';

import { activeUsersWithRoles } from '../../iam/index.js';
import type { Handler, Notice } from './notice-types.js';

// Avisos de Privacidad (B42, decisión 11): el Oficial de Protección de Datos sabe que llegó una
// solicitud de un titular, que está a dos días hábiles de vencer o que vence hoy, y lo mismo del
// plazo para reportar un incidente a la SIC. Los eventos traen solo el código y la fecha.

const payloadSchema = z.object({ id: z.uuid(), code: z.string(), due_on: z.iso.date() });

type Kind = 'prv_request_received' | 'prv_request_due' | 'prv_incident_due';

/** AAAA-MM-DD como se muestra en Colombia: dd/mm/aaaa. */
function shownDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

function toOfficers(kind: Kind, link: string, novelty: string | null): Handler {
  return async (tx, event, now) => {
    const payload = payloadSchema.parse(event.payload);
    const officers = await activeUsersWithRoles(tx, ['OFICIAL_DATOS'], now);
    const values = {
      codigo: payload.code,
      fecha: shownDate(payload.due_on),
      ...(novelty === null ? {} : { novedad: novelty }),
    };
    return officers
      .filter((userId) => userId !== event.actorId)
      .map((userId): Notice => ({ userId, kind, values, link: `${link}/${payload.id}` }));
  };
}

const REQUESTS = '/app/privacidad/solicitudes';
const INCIDENTS = '/app/privacidad/incidentes';

export const PRIVACY_HANDLERS: Readonly<Record<string, Handler>> = {
  'privacy.request.received': toOfficers('prv_request_received', REQUESTS, null),
  'privacy.request.warned': toOfficers('prv_request_due', REQUESTS, 'vence en dos días hábiles'),
  'privacy.request.due': toOfficers('prv_request_due', REQUESTS, 'vence hoy o ya venció'),
  'privacy.incident.warned': toOfficers(
    'prv_incident_due',
    INCIDENTS,
    'debe reportarse en dos días hábiles',
  ),
  'privacy.incident.due': toOfficers(
    'prv_incident_due',
    INCIDENTS,
    'debe reportarse hoy o ya venció el plazo',
  ),
};
