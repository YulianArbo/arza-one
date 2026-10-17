import {
  changeRequestActionSchema,
  changeRequestStatusSchema,
  type ChangeRequest,
  type ChangeRequestStep,
} from '@arza/contracts';

import type { DocChangeRequest, Prisma } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { orgUnitsById } from '../../core/index.js';
import { peopleById } from '../../iam/index.js';
import { participationOf, type Participation } from '../../wf/index.js';
import { CHANGE_REQUEST_STATES } from '../domain/doc-flows.js';
import type { DocReader } from './doc-support.js';

// Vista de las solicitudes de acción documental (B19): qué piden, quién las pidió y decidió, en
// qué paso van y qué puede hacer la persona ahora.

/** Quien ve todo ve todas las solicitudes; quien solo ve lo propio, las que pidió. */
export function visibleRequests(reader: DocReader): Prisma.DocChangeRequestWhereInput {
  return reader.readsAll ? { deletedAt: null } : { deletedAt: null, requestedBy: reader.userId };
}

interface Lookups {
  readonly people: ReadonlyMap<string, string>;
  readonly processes: Awaited<ReturnType<typeof orgUnitsById>>;
  readonly documents: ReadonlyMap<string, { id: string; code: string; title: string }>;
  readonly steps: ReadonlyMap<string, Participation>;
}

async function stepsOf(
  tx: TenantTransaction,
  reader: DocReader,
  requests: readonly DocChangeRequest[],
  at: Date,
): Promise<Map<string, Participation>> {
  const steps = new Map<string, Participation>();
  const open = requests.filter((r) => r.workflowInstanceId !== null && r.decidedAt === null);
  if (open.length === 0) return steps;
  const actor = await reader.taskActor(at);
  for (const request of open) {
    if (request.workflowInstanceId === null) continue;
    const step = await participationOf(tx, request.workflowInstanceId, actor);
    if (step !== null) steps.set(request.id, step);
  }
  return steps;
}

async function lookups(
  tx: TenantTransaction,
  reader: DocReader,
  requests: readonly DocChangeRequest[],
  at: Date,
): Promise<Lookups> {
  const personIds = requests.flatMap((r) => [r.requestedBy, r.decidedBy ?? r.requestedBy]);
  const people = await peopleById(tx, personIds);
  const processIds = requests.flatMap((r) => (r.processId === null ? [] : [r.processId]));
  const documentIds = requests.flatMap((r) => (r.documentId === null ? [] : [r.documentId]));
  const documents = await tx.docDocument.findMany({
    where: { id: { in: documentIds } },
    select: { id: true, code: true, title: true },
  });
  return {
    people: new Map([...people].map(([id, person]) => [id, person.displayName ?? person.email])),
    processes: await orgUnitsById(tx, processIds),
    documents: new Map(documents.map((document) => [document.id, document])),
    steps: await stepsOf(tx, reader, requests, at),
  };
}

function actionsFor(
  request: DocChangeRequest,
  step: Participation | undefined,
  reader: DocReader,
): ChangeRequestStep[] {
  const mine = request.requestedBy === reader.userId;
  if (step === undefined || !reader.canDecideRequests) return [];
  if (step.stateKey === CHANGE_REQUEST_STATES.filed && step.attendsAction) return ['analyze'];
  if (step.stateKey === CHANGE_REQUEST_STATES.analysis && step.attendsApproval && !mine) {
    return ['approve', 'reject'];
  }
  return [];
}

function person(found: Lookups, id: string | null): ChangeRequest['requested_by'] {
  return id === null ? null : { id, name: found.people.get(id) ?? 'Persona retirada' };
}

function view(request: DocChangeRequest, found: Lookups, reader: DocReader): ChangeRequest {
  const process = request.processId === null ? undefined : found.processes.get(request.processId);
  const step = found.steps.get(request.id);
  return {
    id: request.id,
    code: request.code,
    action: changeRequestActionSchema.parse(request.action),
    status: changeRequestStatusSchema.parse(request.status),
    title: request.title,
    justification: request.justification,
    document:
      request.documentId === null ? null : (found.documents.get(request.documentId) ?? null),
    doc_type: request.docType,
    process:
      process === undefined ? null : { id: process.id, code: process.code, name: process.name },
    requested_by: person(found, request.requestedBy),
    requested_at: request.createdAt.toISOString(),
    decided_by: person(found, request.decidedBy),
    decided_at: request.decidedAt?.toISOString() ?? null,
    decision_note: request.decisionNote,
    executed_at: request.executedAt?.toISOString() ?? null,
    workflow_instance_id: request.workflowInstanceId,
    step: step === undefined || step.completed ? null : step.stateLabel,
    actions: actionsFor(request, step, reader),
    version: request.version,
  };
}

export async function changeRequestViews(
  tx: TenantTransaction,
  reader: DocReader,
  requests: readonly DocChangeRequest[],
  at: Date,
): Promise<ChangeRequest[]> {
  const found = await lookups(tx, reader, requests, at);
  return requests.map((request) => view(request, found, reader));
}
