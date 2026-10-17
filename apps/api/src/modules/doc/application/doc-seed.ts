import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { activeProcesses } from '../../core/index.js';
import type { DocActor } from './doc-support.js';
import { createFolderRow } from './folders.js';

// Carpetas iniciales de cada empresa (B18): «Sistema de Gestión de Calidad» con una carpeta por
// proceso, y «Expedientes». Crea lo que falta y nunca toca lo que la empresa cambió, así que se
// puede repetir. Va después de la semilla del núcleo, que crea los procesos.

const QUALITY_ROOT = { code: 'SGC', name: 'Sistema de Gestión de Calidad' } as const;
const CASE_FILES_ROOT = { code: 'EXP', name: 'Expedientes' } as const;

/** Código de la carpeta de un proceso dentro del SGC. */
function processFolderCode(processCode: string): string {
  return `${QUALITY_ROOT.code}-${processCode}`;
}

async function ensureFolder(
  tx: TenantTransaction,
  actor: DocActor,
  folder: { code: string; name: string; parentId: string | null },
): Promise<string> {
  const existing = await tx.docFolder.findFirst({ where: { code: folder.code } });
  if (existing !== null) return existing.id;
  const created = await createFolderRow(tx, actor, {
    parent_id: folder.parentId,
    code: folder.code,
    name: folder.name,
    kind: 'folder',
    entity_type: null,
    entity_id: null,
    classification: 'internal',
  });
  return created.id;
}

async function seedTenantFolders(tx: TenantTransaction, actor: DocActor): Promise<void> {
  const root = await ensureFolder(tx, actor, { ...QUALITY_ROOT, parentId: null });
  for (const process of await activeProcesses(tx)) {
    const code = processFolderCode(process.code);
    await ensureFolder(tx, actor, { code, name: process.name, parentId: root });
  }
  await ensureFolder(tx, actor, { ...CASE_FILES_ROOT, parentId: null });
}

export async function seedDocFolders(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const actor: DocActor = { tenantId, userId: null, meta: null, at: clock.now() };
    await database.withTenant({ tenantId, userId: null }, (tx) => seedTenantFolders(tx, actor));
  }
}
