import { Inject, Injectable } from '@nestjs/common';
import {
  IP_OFFICES,
  type ReleaseRoadmapItem,
  type RoadmapItem,
  type SaveRoadmapItem,
} from '@arza/contracts';

import type { InnIdea, InnIpAsset, InnRoadmapItem } from '../../../generated/prisma/client.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { companyIdentity, fromCalendarDate } from '../../core/index.js';
import {
  assertPerson,
  dateOf,
  innActorOf,
  innConflict,
  innInvalid,
  innNotFound,
  recordInnChange,
  refOf,
  userRefs,
  type InnActor,
  type Target,
} from './inn-support.js';
import { createAsset } from './ip-assets.js';
import { openFollowUp } from './ip-follow-up.js';

// Hoja de ruta de productos propios (B40, ficha 17.16; FT-INN-004). Cada versión liberada propone su
// registro ante la Dirección Nacional de Derecho de Autor: crea el registro de software «propuesto»
// y le da la tarea de radicarlo al responsable del hito (decisión 7).

type ItemRow = InnRoadmapItem & {
  readonly idea: InnIdea | null;
  readonly ipAsset: InnIpAsset | null;
};

const WITH_LINKS = { idea: true, ipAsset: true } as const;

/** Estados de la idea que pueden originar un hito. */
const IDEA_STAGES_FOR_ROADMAP = ['approved', 'in_development', 'implemented'];

function itemData(input: SaveRoadmapItem) {
  return {
    product: input.product,
    title: input.title,
    description: input.description,
    quarter: input.quarter,
    status: input.status,
    ownerId: input.owner_id,
    ideaId: input.idea_id,
  };
}

function itemView(row: ItemRow, owner: RoadmapItem['owner']): RoadmapItem {
  return {
    id: row.id,
    product: row.product,
    title: row.title,
    description: row.description,
    quarter: row.quarter,
    status: row.status as RoadmapItem['status'],
    owner,
    idea:
      row.idea === null ? null : { id: row.idea.id, code: row.idea.code, title: row.idea.title },
    version_label: row.versionLabel,
    released_on: dateOf(row.releasedOn),
    ip_asset: row.ipAsset === null ? null : { id: row.ipAsset.id, code: row.ipAsset.code },
    version: row.version,
  };
}

async function assertItemRefs(tx: TenantTransaction, input: SaveRoadmapItem): Promise<void> {
  await assertPerson(tx, input.owner_id);
  if (input.idea_id === null) return;
  const idea = await tx.innIdea.findFirst({ where: { id: input.idea_id, deletedAt: null } });
  if (idea === null || !IDEA_STAGES_FOR_ROADMAP.includes(idea.stage)) {
    throw innInvalid('El hito solo nace de una idea aprobada.');
  }
}

/** El registro de software que propone la liberación, con la tarea de radicarlo. */
async function proposeRegistration(
  tx: TenantTransaction,
  actor: InnActor,
  item: InnRoadmapItem,
  input: ReleaseRoadmapItem,
): Promise<string> {
  const company = await companyIdentity(tx);
  const title = `${item.product} ${input.version_label}`;
  const asset = await createAsset(tx, actor, {
    kind: 'software',
    title,
    holder: company.legalName,
    registryNumber: null,
    niceClasses: null,
    office: IP_OFFICES.software,
    filedOn: null,
    grantedOn: null,
    expiresOn: null,
    status: 'proposed',
    responsibleId: item.ownerId,
    product: item.product,
    versionLabel: input.version_label,
    documentId: null,
    notes: `Propuesto al liberar «${item.title}».`,
  });
  await openFollowUp(tx, actor, {
    assetId: asset.id,
    responsibleId: item.ownerId,
    title: `Radicar el registro de ${title} (${asset.code})`,
    reason: 'registration',
  });
  return asset.id;
}

@Injectable()
export class Roadmap {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Los hitos por trimestre y producto, con los productos ya escritos para sugerirlos. */
  async list(principal: Principal): Promise<{ data: RoadmapItem[]; products: string[] }> {
    return this.database.withTenant(principal, async (tx) => {
      const rows = await tx.innRoadmapItem.findMany({
        where: { deletedAt: null },
        include: WITH_LINKS,
        orderBy: [{ quarter: 'asc' }, { product: 'asc' }, { title: 'asc' }],
        take: 500,
      });
      const refs = await userRefs(
        tx,
        rows.map((row) => row.ownerId),
      );
      const products = [...new Set(rows.map((row) => row.product))].sort((a, b) =>
        a.localeCompare(b, 'es'),
      );
      return { data: rows.map((row) => itemView(row, refOf(refs, row.ownerId))), products };
    });
  }

  async create(principal: Principal, meta: RequestMeta, input: SaveRoadmapItem): Promise<string> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      await assertItemRefs(tx, input);
      const row = await tx.innRoadmapItem.create({
        data: { tenantId: actor.tenantId, ...itemData(input) },
      });
      await recordInnChange(tx, actor, {
        action: 'inn.roadmap.create',
        event: 'inn.roadmap.created',
        entityType: 'inn_roadmap_item',
        entityId: row.id,
        changes: { product: row.product, title: row.title, quarter: row.quarter },
      });
      return row.id;
    });
  }

  /** Lo liberado ya no se edita. */
  async update(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: SaveRoadmapItem,
  ): Promise<void> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    await this.database.withTenant(principal, async (tx) => {
      const row = await this.editable(tx, target.id);
      await assertItemRefs(tx, input);
      const data = itemData(input);
      const updated = await tx.innRoadmapItem.updateMany({
        where: { id: row.id, version: target.version },
        data,
      });
      if (updated.count !== 1) throw versionConflict();
      await recordInnChange(tx, actor, {
        action: 'inn.roadmap.update',
        event: 'inn.roadmap.updated',
        entityType: 'inn_roadmap_item',
        entityId: row.id,
        changes: changesBetween(
          { quarter: row.quarter, status: row.status, owner_id: row.ownerId },
          { quarter: data.quarter, status: data.status, owner_id: data.ownerId },
        ),
      });
    });
  }

  async release(
    principal: Principal,
    meta: RequestMeta,
    target: Target,
    input: ReleaseRoadmapItem,
  ): Promise<{ readonly ip_asset_id: string }> {
    const actor = innActorOf(principal, this.clock.now(), meta);
    return this.database.withTenant(principal, async (tx) => {
      const row = await this.editable(tx, target.id);
      if (row.status === 'cancelled') throw innConflict('El hito está cancelado.');
      const assetId = await proposeRegistration(tx, actor, row, input);
      const updated = await tx.innRoadmapItem.updateMany({
        where: { id: row.id, version: target.version },
        data: {
          status: 'released',
          versionLabel: input.version_label,
          releasedOn: fromCalendarDate(input.released_on),
          ipAssetId: assetId,
        },
      });
      if (updated.count !== 1) throw versionConflict();
      await recordInnChange(tx, actor, {
        action: 'inn.roadmap.release',
        event: 'inn.roadmap.released',
        entityType: 'inn_roadmap_item',
        entityId: row.id,
        changes: {
          status: [row.status, 'released'],
          version_label: input.version_label,
          ip_asset_id: assetId,
        },
      });
      return { ip_asset_id: assetId };
    });
  }

  private async editable(tx: TenantTransaction, id: string): Promise<InnRoadmapItem> {
    const row = await tx.innRoadmapItem.findFirst({ where: { id, deletedAt: null } });
    if (row === null) throw innNotFound('El hito no existe.');
    if (row.status === 'released') throw innConflict('El hito ya se liberó.');
    return row;
  }
}
