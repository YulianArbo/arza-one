import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Espacio que usan los archivos de la empresa del contexto (B48): el mismo que cuenta el límite
// del plan en la base de datos (core_enforce_storage_limit), es decir, los archivos no borrados.

const BYTES_PER_MB = 1024 * 1024;

export async function storageUsedMb(tx: TenantTransaction): Promise<number> {
  const total = await tx.file.aggregate({ _sum: { sizeBytes: true }, where: { deletedAt: null } });
  return Math.round(((total._sum.sizeBytes ?? 0) / BYTES_PER_MB) * 100) / 100;
}
