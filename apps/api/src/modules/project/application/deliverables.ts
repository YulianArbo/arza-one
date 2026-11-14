import { Inject, Injectable } from '@nestjs/common';
import {
  DELIVERY_ENVIRONMENTS,
  type DeliverableRequest,
  type DeliverRequest,
} from '@arza/contracts';

import type { PrjDeliverable, PrjProject } from '../../../generated/prisma/client.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import { acceptanceSigners } from '../../contract/index.js';
import { addDays, bogotaToday, fromCalendarDate } from '../../core/index.js';
import { recordSystemForm, TECHNICAL_DELIVERY_CODE } from '../../doc/index.js';
import { commercialParties } from '../../party/index.js';
import type { ItemRequester } from './items.js';
import {
  formUnavailable,
  projectNotFound,
  signerInvalid,
  statusInvalid,
} from './project-messages.js';
import {
  assertOpen,
  canOnProject,
  findProjectForItems,
  findVisibleProject,
  statusOf,
} from './project-records.js';
import {
  projectActorOf,
  recordProjectChange,
  type ProjectActor,
  type ProjectPartTarget,
} from './project-support.js';

// Entregables y su entrega al cliente (B27, ficha 17.8). El equipo los prepara; el líder del
// proyecto o un Líder técnico los entrega (decisión 2): la plataforma llena el Acta de Entrega
// Técnica FT-TEC-001 y, cuando su PDF está listo, el worker la envía a firmar a la persona del
// cliente (acceptance-work.ts). Un entregable devuelto se corrige y se entrega de nuevo.

const OPEN_ACCEPTANCES = ['preparing', 'in_signature'];

function deliverableAudit(deliverable: PrjDeliverable): Record<string, string | null> {
  return {
    name: deliverable.name,
    version_label: deliverable.versionLabel,
    milestone_id: deliverable.milestoneId,
    evidence_url: deliverable.evidenceUrl,
    status: deliverable.status,
  };
}

function deliverablePayload(deliverable: PrjDeliverable, project: PrjProject) {
  return {
    project_id: project.id,
    code: project.code,
    manager_id: project.managerId,
    deliverable_id: deliverable.id,
  };
}

function deliveryAudit(
  project: PrjProject,
  deliverable: PrjDeliverable,
  recordCode: string | null,
) {
  return {
    project: project.code,
    ...deliverableAudit(deliverable),
    status: [deliverable.status, 'delivered'],
    record_code: recordCode,
    respond_days: project.respondDays,
  };
}

/** El hito es de este proyecto y aún no está cumplido ni listo para facturar. */
async function assertMilestone(
  tx: TenantTransaction,
  projectId: string,
  milestoneId: string | null,
): Promise<void> {
  if (milestoneId === null) return;
  const milestone = await tx.prjMilestone.findFirst({
    where: { id: milestoneId, projectId, deletedAt: null },
  });
  if (milestone === null) throw projectNotFound('El hito');
  if (milestone.status !== 'pending') {
    throw statusInvalid('El hito ya está cumplido: elija uno pendiente.');
  }
}

async function findDeliverable(
  tx: TenantTransaction,
  target: { readonly id: string; readonly projectId: string },
): Promise<PrjDeliverable> {
  const deliverable = await tx.prjDeliverable.findFirst({
    where: { id: target.id, projectId: target.projectId, deletedAt: null },
  });
  if (deliverable === null) throw projectNotFound('El entregable');
  return deliverable;
}

function deliverableData(input: DeliverableRequest) {
  return {
    name: input.name,
    description: input.description,
    versionLabel: input.version_label,
    milestoneId: input.milestone_id,
    evidenceUrl: input.evidence_url,
  };
}

/** Se entrega en ejecución, en riesgo o en cierre, y sin otra acta abierta. */
async function assertDeliverable(
  tx: TenantTransaction,
  project: PrjProject,
  deliverable: PrjDeliverable,
): Promise<void> {
  if (!['in_progress', 'at_risk', 'closing'].includes(statusOf(project))) {
    throw statusInvalid(
      'Se entrega al cliente con el proyecto en ejecución, en riesgo o en cierre.',
    );
  }
  if (deliverable.status === 'accepted')
    throw statusInvalid('El cliente ya aceptó este entregable.');
  const open = await tx.prjAcceptance.count({
    where: { deliverableId: deliverable.id, status: { in: OPEN_ACCEPTANCES }, deletedAt: null },
  });
  if (open > 0) throw statusInvalid('Este entregable ya tiene un acta esperando al cliente.');
}

/** La persona del cliente que recibe: un firmante autorizado con correo y documento. */
async function signerFor(tx: TenantTransaction, project: PrjProject, signerId: string) {
  const signer = (await acceptanceSigners(tx, project.partyId)).find((s) => s.id === signerId);
  if (signer === undefined) {
    throw signerInvalid('Elija a un firmante autorizado del cliente, registrado en Terceros.');
  }
  if (!signer.ready) {
    throw signerInvalid(
      `Registre en Terceros el correo y el documento de ${signer.name} antes de enviarle el acta.`,
    );
  }
  return signer;
}

/** Los datos del acta FT-TEC-001, con los nombres de sus campos en el formato. */
async function actaData(
  tx: TenantTransaction,
  context: {
    readonly project: PrjProject;
    readonly deliverable: PrjDeliverable;
    readonly at: Date;
  },
  input: DeliverRequest,
  signerName: string,
) {
  const { project, deliverable } = context;
  const party = (await commercialParties(tx, [project.partyId])).get(project.partyId);
  return {
    cliente: party?.name ?? '',
    proyecto: `${project.code} · ${project.name}`,
    fecha: bogotaToday(context.at),
    ambiente: DELIVERY_ENVIRONMENTS[input.environment],
    entregables: [
      {
        entregable: deliverable.name,
        version: deliverable.versionLabel ?? '',
        descripcion: deliverable.description ?? '',
      },
    ],
    pendientes: input.pending_note ?? '',
    recibe_nombre: signerName,
  };
}

@Injectable()
export class DeliverablesUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private actor(requester: ItemRequester): ProjectActor {
    return projectActorOf(requester.principal, requester.meta, this.clock.now());
  }

  async create(
    requester: ItemRequester,
    projectId: string,
    input: DeliverableRequest,
  ): Promise<string> {
    const actor = this.actor(requester);
    return this.database.withTenant(requester.principal, async (tx) => {
      const { project } = await findProjectForItems(tx, requester.ability, projectId);
      assertOpen(project);
      await assertMilestone(tx, projectId, input.milestone_id);
      const deliverable = await tx.prjDeliverable.create({
        data: { tenantId: actor.tenantId, projectId, ...deliverableData(input) },
      });
      await recordProjectChange(tx, actor, {
        action: 'project.deliverable.create',
        event: 'project.deliverable.created',
        entityType: 'prj_deliverable',
        entityId: deliverable.id,
        changes: { project: project.code, ...deliverableAudit(deliverable) },
        payload: deliverablePayload(deliverable, project),
      });
      return deliverable.id;
    });
  }

  /** Se corrige en preparación o devuelto; entregado o aceptado, ya no. */
  async update(
    requester: ItemRequester,
    target: ProjectPartTarget,
    input: DeliverableRequest,
  ): Promise<void> {
    const actor = this.actor(requester);
    await this.database.withTenant(requester.principal, async (tx) => {
      const { project } = await findProjectForItems(tx, requester.ability, target.projectId);
      assertOpen(project);
      const before = await findDeliverable(tx, target);
      if (before.status !== 'preparing' && before.status !== 'returned') {
        throw statusInvalid('Solo se corrige un entregable en preparación o devuelto.');
      }
      if (input.milestone_id !== before.milestoneId) {
        await assertMilestone(tx, target.projectId, input.milestone_id);
      }
      const { count } = await tx.prjDeliverable.updateMany({
        where: { id: target.id, version: target.version, deletedAt: null },
        data: deliverableData(input),
      });
      if (count === 0) throw versionConflict();
      const after = await findDeliverable(tx, target);
      await recordProjectChange(tx, actor, {
        action: 'project.deliverable.update',
        event: 'project.deliverable.updated',
        entityType: 'prj_deliverable',
        entityId: before.id,
        changes: {
          project: project.code,
          ...changesBetween(deliverableAudit(before), deliverableAudit(after)),
        },
        payload: deliverablePayload(after, project),
      });
    });
  }

  /** Entrega al cliente: llena el acta FT-TEC-001; el worker la envía a firmar con su PDF. */
  async deliver(
    requester: ItemRequester,
    target: ProjectPartTarget,
    input: DeliverRequest,
  ): Promise<string> {
    const actor = this.actor(requester);
    return this.database.withTenant(requester.principal, async (tx) => {
      const { project, memberIds } = await findVisibleProject(
        tx,
        requester.ability,
        target.projectId,
      );
      if (!canOnProject(requester.ability, 'project.deliverable.submit', memberIds)) {
        throw permissionDenied();
      }
      const deliverable = await findDeliverable(tx, target);
      await assertDeliverable(tx, project, deliverable);
      const signer = await signerFor(tx, project, input.signer_id);
      const acceptance = await this.newAcceptance(tx, actor, project, deliverable, {
        input,
        signerName: signer.name,
      });
      const { count } = await tx.prjDeliverable.updateMany({
        where: { id: deliverable.id, version: target.version, deletedAt: null },
        data: { status: 'delivered' },
      });
      if (count === 0) throw versionConflict();
      await recordProjectChange(tx, actor, {
        action: 'project.deliverable.deliver',
        event: 'project.deliverable.delivered',
        entityType: 'prj_deliverable',
        entityId: deliverable.id,
        changes: deliveryAudit(project, deliverable, acceptance.recordCode),
        payload: deliverablePayload(deliverable, project),
      });
      return acceptance.id;
    });
  }

  /** El acta con su registro FT-TEC-001 terminado, a la espera de su PDF. */
  private async newAcceptance(
    tx: TenantTransaction,
    actor: ProjectActor,
    project: PrjProject,
    deliverable: PrjDeliverable,
    delivery: { readonly input: DeliverRequest; readonly signerName: string },
  ) {
    const { input, signerName } = delivery;
    const acceptance = await tx.prjAcceptance.create({
      data: {
        tenantId: actor.tenantId,
        projectId: project.id,
        deliverableId: deliverable.id,
        signerPartyId: input.signer_id,
        signerName,
        environment: input.environment,
        pendingNote: input.pending_note,
        message: input.message,
        respondBy: fromCalendarDate(addDays(bogotaToday(actor.at), project.respondDays)),
        deliveredBy: actor.userId ?? project.managerId,
        deliveredAt: actor.at,
      },
    });
    const record = await recordSystemForm(tx, actor, {
      templateCode: TECHNICAL_DELIVERY_CODE,
      entityType: 'prj_acceptance',
      entityId: acceptance.id,
      data: await actaData(tx, { project, deliverable, at: actor.at }, input, signerName),
    });
    if (record === null) throw formUnavailable(TECHNICAL_DELIVERY_CODE);
    return tx.prjAcceptance.update({
      where: { id: acceptance.id },
      data: { formRecordId: record.id, recordCode: record.code },
    });
  }
}
