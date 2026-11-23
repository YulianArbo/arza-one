import {
  PRIVACY_TERMS,
  privacyRequestKindOf,
  type PrivacyRequestChannel,
  type PrivacyRequestKind,
  type PrivacyRight,
} from '@arza/contracts';

import { v7 as uuidv7 } from 'uuid';

import type { PrivacyRequest } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  addDays,
  bogotaStartOf,
  bogotaToday,
  businessDeadline,
  fromCalendarDate,
  nextBusinessCode,
  toCalendarDate,
} from '../../core/index.js';
import { seedPublishedFlow, startWorkflow } from '../../wf/index.js';
import { REQUEST_FLOW, REQUEST_FLOW_DATA } from '../domain/privacy-flows.js';
import { recordPrivacyChange, type PrivacyActor } from './privacy-support.js';
import { addRequestEvent } from './request-records.js';

// Recepción de una solicitud de titular por cualquier canal (B42, decisión 1): el sitio público,
// el portal, el registro del Oficial o el traslado de una PQRSF. Recibe su código, la fecha límite
// legal en días hábiles contada desde el día siguiente (decisión 4), la tarea del Oficial con esa
// fecha y, si hay correo, la constancia que envía el worker.

const REQUEST_SEQUENCE = 'prv.request';
const REQUEST_CODES = { name: 'Solicitudes de titulares', prefix: 'PRV', padding: 4 } as const;

export interface RequestIntake {
  readonly channel: PrivacyRequestChannel;
  readonly right: PrivacyRight;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly documentNumber: string | null;
  readonly description: string;
  /** El día en que llegó; si es hoy, el momento del registro. */
  readonly receivedOn: string;
  readonly partyId: string | null;
  readonly portalUserId: string | null;
  readonly sourceCode: string | null;
  readonly privacyNoticeId: string | null;
}

/** Fecha límite legal: los días del plazo, y los de la prórroga si ya se concedió. */
export async function legalDueOn(
  tx: TenantTransaction,
  from: string,
  kind: PrivacyRequestKind,
  extended: boolean,
): Promise<string> {
  const terms = PRIVACY_TERMS[kind];
  return businessDeadline(tx, from, terms.days + (extended ? terms.extension : 0));
}

/** La tarea vence al terminar el día límite en Colombia. */
export function taskDueAt(dueOn: string): Date {
  return bogotaStartOf(addDays(dueOn, 1));
}

function receivedAt(actor: PrivacyActor, receivedOn: string): Date {
  return receivedOn === bogotaToday(actor.at) ? actor.at : bogotaStartOf(receivedOn);
}

interface TaskTarget {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kind: PrivacyRequestKind;
  readonly dueOn: string;
}

/** La tarea del Oficial con la fecha límite legal; devuelve el trámite. */
async function openTask(tx: TenantTransaction, actor: PrivacyActor, target: TaskTarget) {
  await seedPublishedFlow(tx, actor, REQUEST_FLOW_DATA);
  const instance = await startWorkflow(tx, actor, {
    key: REQUEST_FLOW,
    entityType: REQUEST_FLOW,
    entityId: target.id,
    title: `${target.code} · ${target.name}`,
    facts: { kind: target.kind },
    dueAt: taskDueAt(target.dueOn),
  });
  return instance.id;
}

/** Crea la solicitud y su tarea en una sola escritura de la solicitud (nace en la versión 1). */
async function createRow(
  tx: TenantTransaction,
  actor: PrivacyActor,
  intake: RequestIntake,
): Promise<PrivacyRequest> {
  const kind = privacyRequestKindOf(intake.right);
  const id = uuidv7();
  const code = await nextBusinessCode(tx, REQUEST_SEQUENCE, actor.at, REQUEST_CODES);
  const dueOn = await legalDueOn(tx, intake.receivedOn, kind, false);
  const target = { id, code, name: intake.name, kind, dueOn };
  return tx.privacyRequest.create({
    data: {
      id,
      tenantId: actor.tenantId,
      code,
      right: intake.right,
      kind,
      channel: intake.channel,
      requesterName: intake.name,
      requesterEmail: intake.email,
      requesterPhone: intake.phone,
      documentNumber: intake.documentNumber,
      description: intake.description,
      partyId: intake.partyId,
      portalUserId: intake.portalUserId,
      sourceCode: intake.sourceCode,
      privacyNoticeId: intake.privacyNoticeId,
      receivedAt: receivedAt(actor, intake.receivedOn),
      dueOn: fromCalendarDate(dueOn),
      workflowInstanceId: await openTask(tx, actor, target),
    },
  });
}

/** Registra la solicitud con su plazo, su tarea, su historia y el aviso al Oficial. */
export async function fileRequest(
  tx: TenantTransaction,
  actor: PrivacyActor,
  intake: RequestIntake,
): Promise<PrivacyRequest> {
  const row = await createRow(tx, actor, intake);
  await addRequestEvent(tx, actor, row, {
    kind: 'received',
    note: null,
    mail: row.requesterEmail !== null,
  });
  const dueOn = toCalendarDate(row.dueOn ?? actor.at);
  await recordPrivacyChange(tx, actor, {
    action: 'privacy.request.receive',
    event: 'privacy.request.received',
    entityType: 'prv_request',
    entityId: row.id,
    changes: { code: row.code, right: row.right, kind: row.kind, channel: row.channel },
    payload: { id: row.id, code: row.code, kind: row.kind, due_on: dueOn },
  });
  return row;
}
