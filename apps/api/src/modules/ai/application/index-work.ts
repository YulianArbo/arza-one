import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  indexableVersions,
  tenantsWithReadyTexts,
  versionText,
  type IndexableVersion,
} from '../../doc/index.js';
import { chunksOf } from '../domain/chunking.js';
import { aiSystemActor, recordAiChange } from './ai-support.js';

// Índice del asistente (B47, decisión 3): el worker parte en fragmentos el texto vigente de los
// documentos internos y confidenciales que Gestión documental ya extrajo (B21) y borra los de las
// versiones que dejaron de estar vigentes o pasaron a ser restringidas. Repetirlo no cambia nada.

export interface AiIndexDependencies {
  readonly database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>;
  readonly clock: Clock;
}

export interface AiIndexResult {
  readonly indexed: number;
  readonly removed: number;
}

/** Versiones nuevas que se indexan por empresa en cada pasada; las demás, en la siguiente. */
const BATCH = 20;

async function indexVersion(tx: TenantTransaction, tenantId: string, version: IndexableVersion) {
  const chunks = chunksOf((await versionText(tx, version.versionId)) ?? '');
  await tx.aiIndexChunk.createMany({
    data: chunks.map((content, chunkNo) => ({
      tenantId,
      documentId: version.documentId,
      documentVersionId: version.versionId,
      chunkNo,
      content,
      classification: version.classification,
    })),
    skipDuplicates: true,
  });
}

async function indexTenant(deps: AiIndexDependencies, tenantId: string): Promise<AiIndexResult> {
  const at = deps.clock.now();
  return deps.database.withTenant({ tenantId, userId: null }, async (tx) => {
    const wanted = await indexableVersions(tx);
    const wantedIds = wanted.map((version) => version.versionId);
    const present = await tx.aiIndexChunk.findMany({
      distinct: ['documentVersionId'],
      select: { documentVersionId: true },
    });
    const presentIds = new Set(present.map((row) => row.documentVersionId));
    const { count: removed } = await tx.aiIndexChunk.deleteMany({
      where: { documentVersionId: { notIn: wantedIds } },
    });
    const pending = wanted.filter((version) => !presentIds.has(version.versionId)).slice(0, BATCH);
    for (const version of pending) await indexVersion(tx, tenantId, version);
    if (pending.length > 0 || removed > 0) {
      await recordAiChange(tx, aiSystemActor(tenantId, at), {
        action: 'ai.index.update',
        event: 'ai.index.updated',
        entityType: 'ai_index',
        entityId: tenantId,
        changes: { indexed_versions: pending.length, removed_chunks: removed },
      });
    }
    return { indexed: pending.length, removed };
  });
}

/** Trabajo del worker: el índice del asistente de todas las empresas con textos listos. */
export async function refreshAiIndex(deps: AiIndexDependencies): Promise<AiIndexResult> {
  let indexed = 0;
  let removed = 0;
  for (const tenantId of await tenantsWithReadyTexts(deps.database)) {
    const result = await indexTenant(deps, tenantId);
    indexed += result.indexed;
    removed += result.removed;
  }
  return { indexed, removed };
}
