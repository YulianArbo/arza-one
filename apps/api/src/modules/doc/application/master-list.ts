import { Inject, Injectable } from '@nestjs/common';
import type {
  Document,
  MasterListEntry,
  MasterListQuery,
  MasterListResponse,
} from '@arza/contracts';

import type { Prisma } from '../../../generated/prisma/client.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import type { Principal } from '../../../platform/access/principal.js';
import { CLOCK, type Clock } from '../../../platform/clock/clock.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { bogotaToday } from '../../core/index.js';
import { toCsv } from '../domain/csv.js';
import {
  DOCUMENT_STATUS_LABELS,
  displayDate,
  MASTER_LIST_COLUMNS,
} from '../domain/master-list-format.js';
import { actorOf, auditDoc, readerOf, visibleDocuments, type DocReader } from './doc-support.js';
import { documentViews } from './document-views.js';

// Listado Maestro en línea (B19, RE-SGC-001 y ficha 17.4): los documentos del SGC con código,
// nombre, tipo, proceso, versión, fecha, estado y responsable, siempre al día porque se arma con
// los documentos mismos. La exportación queda en la auditoría.

export interface MasterListFile {
  readonly fileName: string;
  readonly content: string;
}

function listWhere(reader: DocReader, query: MasterListQuery): Prisma.DocDocumentWhereInput {
  const filters: Prisma.DocDocumentWhereInput[] = [
    visibleDocuments(reader),
    { isControlled: true, status: query.status },
  ];
  if (query.process_id !== undefined) filters.push({ processId: query.process_id });
  if (query.doc_type !== undefined) filters.push({ docType: query.doc_type });
  if (query.q !== undefined) {
    const contains = { contains: query.q, mode: 'insensitive' } as const;
    filters.push({ OR: [{ code: contains }, { title: contains }] });
  }
  return { AND: filters };
}

function entryOf(document: Document): MasterListEntry {
  const version = document.current_version;
  return {
    document_id: document.id,
    code: document.code,
    title: document.title,
    doc_type: document.doc_type,
    doc_type_label: document.doc_type_label,
    process: document.process,
    version_label: version?.label ?? null,
    effective_date: version?.effective_date ?? null,
    status: document.status,
    owner_position: document.owner_position?.name ?? null,
  };
}

/** Las filas del listado, en orden de código. */
export async function masterListEntries(
  tx: TenantTransaction,
  reader: DocReader,
  query: MasterListQuery,
): Promise<MasterListEntry[]> {
  const documents = await tx.docDocument.findMany({
    where: listWhere(reader, query),
    orderBy: { code: 'asc' },
  });
  return (await documentViews(tx, documents, () => false)).map(entryOf);
}

function csvRow(entry: MasterListEntry): (string | null)[] {
  return [
    entry.code,
    entry.title,
    entry.doc_type,
    entry.process?.code ?? null,
    entry.version_label,
    displayDate(entry.effective_date),
    DOCUMENT_STATUS_LABELS[entry.status],
    entry.owner_position,
  ];
}

@Injectable()
export class MasterListUseCase {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(
    principal: Principal,
    ability: AppAbility,
    query: MasterListQuery,
  ): Promise<MasterListResponse> {
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const data = await masterListEntries(tx, reader, query);
      return { data, total: data.length };
    });
  }

  /** El listado con los filtros dados, en CSV para Excel. */
  async export(
    principal: Principal,
    ability: AppAbility,
    query: MasterListQuery,
    meta: RequestMeta,
  ): Promise<MasterListFile> {
    const actor = actorOf(principal, meta, this.clock.now());
    return this.database.withTenant(principal, async (tx) => {
      const reader = await readerOf(tx, principal, ability);
      const entries = await masterListEntries(tx, reader, query);
      await auditDoc(tx, actor, {
        action: 'doc.master_list.export',
        entityType: 'doc_document',
        entityId: null,
        changes: { rows: entries.length, status: query.status },
      });
      return {
        fileName: `listado-maestro-${bogotaToday(actor.at)}.csv`,
        content: toCsv(MASTER_LIST_COLUMNS, entries.map(csvRow)),
      };
    });
  }
}
