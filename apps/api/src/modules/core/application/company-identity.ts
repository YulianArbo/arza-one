import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// La empresa como se identifica en los documentos que emite (B20): razón social y NIT, para el pie
// institucional de los PDF. Los demás módulos la piden aquí; nunca leen core_tenants.

export interface CompanyIdentity {
  readonly legalName: string;
  readonly taxId: string;
}

/** La empresa del contexto de la transacción. */
export async function companyIdentity(tx: TenantTransaction): Promise<CompanyIdentity> {
  const tenant = await tx.tenant.findFirstOrThrow({ select: { legalName: true, taxId: true } });
  return { legalName: tenant.legalName, taxId: tenant.taxId };
}
