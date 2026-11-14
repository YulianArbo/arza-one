import { Inject, Injectable } from '@nestjs/common';
import {
  acceptanceStatusSchema,
  deliverableStatusSchema,
  type Deliverable,
  type DeliveryOptions,
  type DownloadLinkResponse,
} from '@arza/contracts';

import type {
  PrjAcceptance,
  PrjDeliverable,
  PrjMilestone,
} from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { acceptanceSigners } from '../../contract/index.js';
import { toCalendarDate } from '../../core/index.js';
import {
  AttachedFileLinks,
  isFormPublished,
  systemFormPdf,
  TECHNICAL_DELIVERY_CODE,
} from '../../doc/index.js';
import { projectNotFound, statusInvalid } from './project-messages.js';
import { findVisibleProject } from './project-records.js';
import { peopleNames, personRef } from './project-support.js';

// Consultas de entregables y actas (B27): la lista con la última entrega de cada uno, quién puede
// recibir el acta por el cliente y el enlace para descargar el acta (la firmada si ya la hay).

type DeliverableRow = PrjDeliverable & {
  readonly milestone: Pick<PrjMilestone, 'id' | 'name'> | null;
  readonly acceptances: readonly PrjAcceptance[];
};

function acceptanceView(acceptance: PrjAcceptance, names: ReadonlyMap<string, string>) {
  return {
    id: acceptance.id,
    status: acceptanceStatusSchema.parse(acceptance.status),
    record_code: acceptance.recordCode,
    envelope_code: acceptance.envelopeCode,
    signer_name: acceptance.signerName,
    delivered_by: personRef(names, acceptance.deliveredBy),
    delivered_at: acceptance.deliveredAt.toISOString(),
    respond_by: toCalendarDate(acceptance.respondBy),
    answered_at: acceptance.answeredAt?.toISOString() ?? null,
    client_note: acceptance.clientNote,
    signed_pdf: acceptance.signedFileId !== null,
  };
}

function deliverableView(row: DeliverableRow, names: ReadonlyMap<string, string>): Deliverable {
  const last = row.acceptances[0];
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version_label: row.versionLabel,
    milestone: row.milestone,
    evidence_url: row.evidenceUrl,
    status: deliverableStatusSchema.parse(row.status),
    acceptance: last === undefined ? null : acceptanceView(last, names),
    version: row.version,
  };
}

@Injectable()
export class DeliveryQueries {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AttachedFileLinks) private readonly links: AttachedFileLinks,
  ) {}

  async list(principal: Principal, ability: AppAbility, projectId: string): Promise<Deliverable[]> {
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleProject(tx, ability, projectId);
      const rows = await tx.prjDeliverable.findMany({
        where: { projectId, deletedAt: null },
        include: {
          milestone: { select: { id: true, name: true } },
          acceptances: {
            where: { deletedAt: null },
            orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
            take: 1,
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      const names = await peopleNames(
        tx,
        rows.flatMap((row) => row.acceptances.map((acceptance) => acceptance.deliveredBy)),
      );
      return rows.map((row) => deliverableView(row, names));
    });
  }

  async options(
    principal: Principal,
    ability: AppAbility,
    projectId: string,
  ): Promise<DeliveryOptions> {
    return this.database.withTenant(principal, async (tx) => {
      const { project } = await findVisibleProject(tx, ability, projectId);
      const [signers, formReady] = await Promise.all([
        acceptanceSigners(tx, project.partyId),
        isFormPublished(tx, TECHNICAL_DELIVERY_CODE),
      ]);
      return {
        signers,
        respond_days: project.respondDays,
        tacit_acceptance: project.tacitAcceptance,
        form_ready: formReady,
      };
    });
  }

  /** El acta de la última entrega: la firmada si el cliente firmó; si no, la que se le envió. */
  async actaLink(
    principal: Principal,
    ability: AppAbility,
    target: { readonly projectId: string; readonly id: string },
    meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleProject(tx, ability, target.projectId);
      const acceptance = await tx.prjAcceptance.findFirst({
        where: { deliverableId: target.id, projectId: target.projectId, deletedAt: null },
        orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }],
      });
      if (acceptance === null) throw projectNotFound('El acta');
      const pdf =
        acceptance.signedFileId ??
        (acceptance.formRecordId === null
          ? null
          : ((await systemFormPdf(tx, acceptance.formRecordId))?.fileId ?? null));
      if (pdf === null)
        throw statusInvalid('El PDF del acta aún se está generando. Intente en un momento.');
      return this.links.issue(tx, principal, pdf, meta);
    });
  }
}
