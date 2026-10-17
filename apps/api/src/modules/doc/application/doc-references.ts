import { allowedFileTypeSchema } from '@arza/contracts';

import type { File } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  isActiveCatalogCode,
  orgUnitsById,
  positionsById,
  type OrgUnitRecord,
} from '../../core/index.js';
import { isVersionSource } from '../domain/document-rules.js';
import { referenceInvalid, sourceInvalid } from './doc-messages.js';

// Validación de lo que un documento toma de otros módulos (B18): el tipo del catálogo, el proceso
// y el cargo del núcleo, y el archivo fuente ya analizado.

export const DOCUMENT_TYPES_CATALOG = 'document_types';

export async function assertDocumentType(tx: TenantTransaction, code: string): Promise<void> {
  if (!(await isActiveCatalogCode(tx, DOCUMENT_TYPES_CATALOG, code))) throw referenceInvalid();
}

/** Un proceso activo del mapa de procesos (no un área). */
export async function activeProcess(
  tx: TenantTransaction,
  processId: string,
): Promise<OrgUnitRecord> {
  const process = (await orgUnitsById(tx, [processId])).get(processId);
  if (process?.kind !== 'process' || !process.isActive) throw referenceInvalid();
  return process;
}

export async function assertPosition(
  tx: TenantTransaction,
  positionId: string | null,
): Promise<void> {
  if (positionId === null) return;
  const position = (await positionsById(tx, [positionId])).get(positionId);
  if (position?.isActive !== true) throw referenceInvalid();
}

/** El archivo fuente: un PDF, Word o Excel que la persona subió y que pasó el antivirus. */
export async function versionSource(
  tx: TenantTransaction,
  userId: string,
  fileId: string,
): Promise<File> {
  const file = await tx.file.findFirst({
    where: { id: fileId, createdBy: userId, scanStatus: 'available', deletedAt: null },
  });
  if (file === null || !isVersionSource(allowedFileTypeSchema.parse(file.mimeType))) {
    throw sourceInvalid();
  }
  return file;
}
