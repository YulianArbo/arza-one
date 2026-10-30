import { z } from 'zod';

import type { Handler, Notice } from './notice-types.js';

// Avisos de Contratos (B24): quien elaboró el contrato o el otrosí se entera de lo que decidió la
// Dirección; el responsable, de los vencimientos y de su firma; el responsable de una obligación,
// de que se acerca o venció. Desde el B25, el responsable y el autor se enteran de cómo terminó la
// firma electrónica. Nadie recibe aviso de lo que hizo él mismo.

const contractEventSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  author_id: z.uuid().nullable(),
  responsible_id: z.uuid().nullable(),
  days: z.number().int().optional(),
});

const amendmentEventSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  contract_id: z.uuid(),
  author_id: z.uuid().nullable(),
});

const obligationEventSchema = z.object({
  contract_id: z.uuid(),
  code: z.string(),
  responsible_id: z.uuid(),
  due_on: z.iso.date(),
});

const signatureEventSchema = z.object({
  contract_id: z.uuid(),
  document_code: z.string(),
  author_id: z.uuid().nullable(),
  responsible_id: z.uuid().nullable(),
});

/** Cómo terminó el proceso de firma (B25): al responsable y al autor del contrato. */
const SIGNATURE_UPDATES: Readonly<Record<string, string>> = {
  'envelope.completed':
    'quedó firmado electrónicamente por todas las partes; el documento firmado y su certificado están en la ficha',
  'signature.envelope.rejected':
    'un firmante rechazó el documento; revise el motivo en la pestaña Firmas',
  'signature.envelope.expired': 'venció el plazo para firmar sin que firmaran todos',
  'signature.envelope.cancelled': 'se anuló el proceso de firma electrónica',
};

/** Novedades del contrato y a quién van: al autor o al responsable. */
const CONTRACT_UPDATES: Readonly<Record<string, { to: 'author' | 'responsible'; text: string }>> = {
  'contract.approved': {
    to: 'author',
    text: 'la Dirección lo aprobó; su PDF definitivo ya se prepara',
  },
  'contract.returned': { to: 'author', text: 'la Dirección lo devolvió para corregir' },
  'contract.signed': { to: 'responsible', text: 'se registró la copia firmada y quedó vigente' },
  'contract.expired': { to: 'responsible', text: 'terminó su plazo' },
};

const AMENDMENT_UPDATES: Readonly<Record<string, string>> = {
  'contract.amendment.approved':
    'la Dirección aprobó el otrosí; registre su copia firmada para que rija',
  'contract.amendment.returned': 'la Dirección devolvió el otrosí',
};

function notice(userId: string, contract: string, novedad: string, id: string): Notice {
  return {
    userId,
    kind: 'ctr_contract_update',
    values: { contrato: contract, novedad },
    link: `/app/contratos/${id}`,
  };
}

const onContractUpdate: Handler = (_tx, event) => {
  const payload = contractEventSchema.parse(event.payload);
  const update = CONTRACT_UPDATES[event.eventType];
  const userId = update?.to === 'author' ? payload.author_id : payload.responsible_id;
  if (update === undefined || userId === null || userId === event.actorId) {
    return Promise.resolve([]);
  }
  return Promise.resolve([notice(userId, payload.code, update.text, payload.id)]);
};

/** La alerta de 90, 60 y 30 días: al responsable, con la tarea que ya está en Mis tareas. */
const onContractExpiring: Handler = (_tx, event) => {
  const payload = contractEventSchema.parse(event.payload);
  if (payload.responsible_id === null) return Promise.resolve([]);
  const text = `vence en ${String(payload.days ?? 0)} días o menos; revise la tarea en Mis tareas`;
  return Promise.resolve([notice(payload.responsible_id, payload.code, text, payload.id)]);
};

const onAmendmentUpdate: Handler = (_tx, event) => {
  const payload = amendmentEventSchema.parse(event.payload);
  const text = AMENDMENT_UPDATES[event.eventType];
  if (text === undefined || payload.author_id === null || payload.author_id === event.actorId) {
    return Promise.resolve([]);
  }
  return Promise.resolve([notice(payload.author_id, payload.code, text, payload.contract_id)]);
};

function printed(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

const onObligation: Handler = (_tx, event) => {
  const payload = obligationEventSchema.parse(event.payload);
  const due = printed(payload.due_on);
  const text =
    event.eventType === 'contract.obligation.overdue'
      ? `una obligación a su cargo venció el ${due} sin cumplirse`
      : `una obligación a su cargo vence el ${due}`;
  return Promise.resolve([notice(payload.responsible_id, payload.code, text, payload.contract_id)]);
};

const onSignatureUpdate: Handler = (_tx, event) => {
  const payload = signatureEventSchema.parse(event.payload);
  const text = SIGNATURE_UPDATES[event.eventType];
  if (text === undefined) return Promise.resolve([]);
  const people = [...new Set([payload.responsible_id, payload.author_id])].filter(
    (id): id is string => id !== null && id !== event.actorId,
  );
  return Promise.resolve(
    people.map((userId) => notice(userId, payload.document_code, text, payload.contract_id)),
  );
};

export const CONTRACT_HANDLERS: Readonly<Record<string, Handler>> = {
  ...Object.fromEntries(Object.keys(CONTRACT_UPDATES).map((type) => [type, onContractUpdate])),
  ...Object.fromEntries(Object.keys(AMENDMENT_UPDATES).map((type) => [type, onAmendmentUpdate])),
  'contract.expiring': onContractExpiring,
  'contract.obligation.due': onObligation,
  'contract.obligation.overdue': onObligation,
  ...Object.fromEntries(Object.keys(SIGNATURE_UPDATES).map((type) => [type, onSignatureUpdate])),
};
