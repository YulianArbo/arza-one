import { Inject, Injectable } from '@nestjs/common';
import {
  linkEntitySchema,
  linkRelationSchema,
  type CreateDocumentLinkRequest,
  type DocumentLink,
  type LinkEntity,
} from '@arza/contracts';

import type { DocLink } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { orgUnitsById, positionsById } from '../../core/index.js';
import { linkNotFound, referenceInvalid } from './doc-messages.js';
import { actorOf, auditDoc, readerOf } from './doc-support.js';
import { findVisibleDocument } from './documents.js';
import { DOC_PARTY_LOOKUP, type DocPartyLookup } from './party-lookup.js';

// Vínculos de un documento (B18; numeral 18.2, paso 3): con un cargo, un proceso o un tercero. Los
// registros son de otros módulos y se consultan por su índice. Retirar un vínculo es lógico.

type Names = ReadonlyMap<string, { readonly name: string; readonly current: boolean }>;

@Injectable()
export class DocumentLinksUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DOC_PARTY_LOOKUP) private readonly parties: DocPartyLookup,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    documentId: string,
  ): Promise<DocumentLink[]> {
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleDocument(tx, await readerOf(tx, principal, ability), documentId);
      const links = await tx.docLink.findMany({
        where: { documentId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      const names = await this.names(tx, links);
      return links.map((link) => ({
        id: link.id,
        entity_type: linkEntitySchema.parse(link.entityType),
        entity_id: link.entityId,
        entity_name: names.get(link.entityId)?.name ?? null,
        relation: linkRelationSchema.parse(link.relation),
      }));
    });
  }

  /** Vincula el documento; si el vínculo se había retirado, vuelve con la relación nueva. */
  async create(
    principal: Principal,
    ability: AppAbility,
    documentId: string,
    input: CreateDocumentLinkRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      await findVisibleDocument(tx, await readerOf(tx, principal, ability), documentId);
      const target = (await this.lookup(tx, input.entity_type, [input.entity_id])).get(
        input.entity_id,
      );
      if (target?.current !== true) throw referenceInvalid();
      const key = { documentId, entityType: input.entity_type, entityId: input.entity_id };
      const link = await tx.docLink.upsert({
        where: { tenantId_documentId_entityType_entityId: { tenantId: actor.tenantId, ...key } },
        create: { tenantId: actor.tenantId, ...key, relation: input.relation },
        update: { relation: input.relation, deletedAt: null },
      });
      await auditDoc(tx, actor, {
        action: 'doc.link.create',
        entityType: 'doc_link',
        entityId: link.id,
        changes: { document_id: documentId, ...input },
      });
      return link.id;
    });
  }

  async remove(
    principal: Principal,
    ability: AppAbility,
    target: { readonly documentId: string; readonly linkId: string },
    meta: RequestMeta,
  ): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      await findVisibleDocument(tx, await readerOf(tx, principal, ability), target.documentId);
      const { count } = await tx.docLink.updateMany({
        where: { id: target.linkId, documentId: target.documentId, deletedAt: null },
        data: { deletedAt: actor.at },
      });
      if (count === 0) throw linkNotFound();
      await auditDoc(tx, actor, {
        action: 'doc.link.delete',
        entityType: 'doc_link',
        entityId: target.linkId,
        changes: { document_id: target.documentId },
      });
    });
  }

  private async names(tx: TenantTransaction, links: readonly DocLink[]): Promise<Names> {
    const byType = (type: LinkEntity) =>
      links.filter((link) => link.entityType === type).map((link) => link.entityId);
    const all = await Promise.all(
      linkEntitySchema.options.map((type) => this.lookup(tx, type, byType(type))),
    );
    return new Map(all.flatMap((found) => [...found]));
  }

  /** Nombre del registro y si sigue vigente (activo, o no retirado ni fusionado). */
  private async lookup(
    tx: TenantTransaction,
    type: LinkEntity,
    ids: readonly string[],
  ): Promise<Names> {
    if (type === 'party') {
      const parties = await this.parties.describe(tx, ids);
      return new Map([...parties].map(([id, p]) => [id, { name: p.name, current: p.isCurrent }]));
    }
    if (type === 'position') {
      const positions = await positionsById(tx, ids);
      return new Map([...positions].map(([id, p]) => [id, { name: p.name, current: p.isActive }]));
    }
    const units = await orgUnitsById(tx, ids);
    return new Map(
      [...units]
        .filter(([, unit]) => unit.kind === 'process')
        .map(([id, unit]) => [id, { name: `${unit.code} · ${unit.name}`, current: unit.isActive }]),
    );
  }
}
