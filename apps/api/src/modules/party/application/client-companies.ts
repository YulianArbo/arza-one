import type { ClientCompanies, ClientCompany } from '../../iam/index.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { partyName } from './party-support.js';

// Empresa cliente de una cuenta del portal (B22A), para identidad: su nombre, su logo y si se
// puede ligar. Lo consulta identidad dentro de su transacción, con la seguridad por fila activa.

async function describeClientCompany(
  tx: TenantTransaction,
  partyId: string,
): Promise<ClientCompany | null> {
  const party = await tx.party.findFirst({
    where: { id: partyId, deletedAt: null },
    include: { roles: { where: { role: 'customer', status: 'active', deletedAt: null } } },
  });
  if (party === null) return null;
  return {
    id: party.id,
    name: partyName(party),
    logoFileId: party.logoFileId,
    isClient:
      party.kind === 'organization' &&
      party.status === 'active' &&
      party.mergedIntoId === null &&
      party.roles.length > 0,
  };
}

export const CLIENT_COMPANY_RECORDS: ClientCompanies = { describe: describeClientCompany };
