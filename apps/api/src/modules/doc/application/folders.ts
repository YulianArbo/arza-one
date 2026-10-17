import { Inject, Injectable } from '@nestjs/common';
import {
  caseFileEntitySchema,
  classificationSchema,
  folderKindSchema,
  type CreateFolderRequest,
  type Folder,
  type UpdateFolderRequest,
} from '@arza/contracts';

import type { DocFolder } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { changesBetween } from '../../../platform/audit/audit-recorder.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { versionConflict } from '../../../platform/http/if-match.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { caseFileExists, folderInvalid, folderNotFound } from './doc-messages.js';
import {
  actorOf,
  auditDoc,
  readerOf,
  visibleDocuments,
  type DocActor,
  type DocReader,
} from './doc-support.js';
import { DOC_PARTY_LOOKUP, type DocPartyLookup } from './party-lookup.js';

// Carpetas y expedientes (B18, ficha 17.4): el explorador de expedientes. Una carpeta no cambia de
// lugar; un expediente es de un tercero y cada tercero tiene a lo más uno.

function folderView(
  folder: DocFolder,
  counts: ReadonlyMap<string, number>,
  names: ReadonlyMap<string, string>,
): Folder {
  return {
    id: folder.id,
    parent_id: folder.parentId,
    code: folder.code,
    name: folder.name,
    kind: folderKindSchema.parse(folder.kind),
    entity_type: folder.entityType === null ? null : caseFileEntitySchema.parse(folder.entityType),
    entity_id: folder.entityId,
    entity_name: folder.entityId === null ? null : (names.get(folder.entityId) ?? null),
    classification: classificationSchema.parse(folder.classification),
    document_count: counts.get(folder.id) ?? 0,
    version: folder.version,
  };
}

export async function findFolder(tx: TenantTransaction, id: string): Promise<DocFolder> {
  const folder = await tx.docFolder.findFirst({ where: { id, deletedAt: null } });
  if (folder === null) throw folderNotFound();
  return folder;
}

/** Documentos visibles por carpeta. */
async function documentCounts(
  tx: TenantTransaction,
  reader: DocReader,
): Promise<Map<string, number>> {
  const groups = await tx.docDocument.groupBy({
    by: ['folderId'],
    where: visibleDocuments(reader),
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.folderId, group._count._all]));
}

/** Quien solo ve lo propio no ve los expedientes donde no tiene documentos. */
function visibleFolders(
  folders: readonly DocFolder[],
  reader: DocReader,
  counts: ReadonlyMap<string, number>,
): DocFolder[] {
  if (reader.readsAll) return [...folders];
  return folders.filter((folder) => folder.kind === 'folder' || counts.has(folder.id));
}

export async function createFolderRow(
  tx: TenantTransaction,
  actor: DocActor,
  data: Omit<CreateFolderRequest, 'kind'> & { kind: DocFolder['kind']; code: string | null },
): Promise<DocFolder> {
  const folder = await tx.docFolder.create({
    data: {
      tenantId: actor.tenantId,
      parentId: data.parent_id,
      code: data.code,
      name: data.name,
      kind: data.kind,
      entityType: data.entity_type,
      entityId: data.entity_id,
      classification: data.classification,
    },
  });
  await auditDoc(tx, actor, {
    action: 'doc.folder.create',
    entityType: 'doc_folder',
    entityId: folder.id,
    changes: { name: folder.name, kind: folder.kind, parent_id: folder.parentId },
  });
  return folder;
}

@Injectable()
export class FoldersUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(DOC_PARTY_LOOKUP) private readonly parties: DocPartyLookup,
  ) {}

  async list(principal: Principal, ability: AppAbility): Promise<Folder[]> {
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const counts = await documentCounts(tx, reader);
      const all = await tx.docFolder.findMany({
        where: { deletedAt: null },
        orderBy: { name: 'asc' },
      });
      const folders = visibleFolders(all, reader, counts);
      const partyIds = folders.flatMap((folder) =>
        folder.entityId === null ? [] : [folder.entityId],
      );
      const parties = await this.parties.describe(tx, partyIds);
      const names = new Map([...parties].map(([id, party]) => [id, party.name]));
      return folders.map((folder) => folderView(folder, counts, names));
    });
  }

  async create(
    principal: Principal,
    input: CreateFolderRequest,
    meta: RequestMeta,
  ): Promise<string> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      await this.assertPlacement(tx, input);
      const folder = await createFolderRow(tx, actor, { ...input, code: null });
      return folder.id;
    });
  }

  async update(
    principal: Principal,
    id: string,
    version: number,
    input: UpdateFolderRequest,
    meta: RequestMeta,
  ): Promise<void> {
    const actor = actorOf(principal, meta, this.clock.now());
    await this.database.withTenant(principal, async (tx) => {
      const before = await findFolder(tx, id);
      const { count } = await tx.docFolder.updateMany({ where: { id, version }, data: input });
      if (count === 0) throw versionConflict();
      await auditDoc(tx, actor, {
        action: 'doc.folder.update',
        entityType: 'doc_folder',
        entityId: id,
        changes: changesBetween(
          { name: before.name, classification: before.classification },
          { name: input.name, classification: input.classification },
        ),
      });
    });
  }

  /** La carpeta madre existe; un expediente es de un tercero vigente y no va dentro de otro. */
  private async assertPlacement(tx: TenantTransaction, input: CreateFolderRequest): Promise<void> {
    const parent = input.parent_id === null ? null : await findFolder(tx, input.parent_id);
    if (input.kind !== 'case_file' || input.entity_id === null) return;
    if (parent?.kind === 'case_file') throw folderInvalid();
    const party = (await this.parties.describe(tx, [input.entity_id])).get(input.entity_id);
    if (party?.isCurrent !== true) throw folderInvalid();
    const taken = await tx.docFolder.count({
      where: { entityType: 'party', entityId: input.entity_id },
    });
    if (taken > 0) throw caseFileExists();
  }
}
