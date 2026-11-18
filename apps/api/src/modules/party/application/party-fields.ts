import type { UpdatePartyRequest } from '@arza/contracts';

import { Prisma, type Party as PartyRow } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { isActiveCatalogCode } from '../../core/index.js';
import { catalogValueInvalid, partyDuplicate } from './party-messages.js';
import { partyName } from './party-support.js';

export type PartyData = UpdatePartyRequest;

/** Columnas del tercero que vienen del formulario, con el teléfono ya normalizado. */
export interface PartyColumns {
  readonly kind: PartyRow['kind'];
  readonly idType: string | null;
  readonly idNumber: string | null;
  readonly checkDigit: number | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly city: string | null;
  readonly address: string | null;
  readonly legalName: string | null;
  readonly tradeName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
}

/** Datos del tercero que quedan en la auditoría, sin dirección ni teléfono completos. */
export interface PartyAudit {
  readonly kind: PartyRow['kind'];
  readonly name: string;
  readonly id_type: string | null;
  readonly id_number: string | null;
  readonly email: string | null;
  readonly city: string | null;
  readonly status: PartyRow['status'];
  readonly [key: string]: string | number | boolean | null;
}

/**
 * Columnas del tercero a partir del formulario; el contrato ya exige los datos de cada tipo. El
 * teléfono se guarda sin espacios para encontrar duplicados.
 */
export function columnsOf(input: PartyData): PartyColumns {
  return {
    kind: input.kind,
    idType: input.id_type,
    idNumber: input.id_number,
    checkDigit: input.check_digit,
    email: input.email,
    phone: input.phone === null ? null : input.phone.replaceAll(' ', ''),
    city: input.city,
    address: input.address,
    legalName: input.legal_name,
    tradeName: input.trade_name,
    firstName: input.first_name,
    lastName: input.last_name,
  };
}

/** Lo que guarda la auditoría: sin dirección ni teléfono completos, que no aportan al historial. */
export function auditOf(party: PartyRow): PartyAudit {
  return {
    kind: party.kind,
    name: partyName(party),
    id_type: party.idType,
    id_number: party.idNumber,
    email: party.email,
    city: party.city,
    status: party.status,
  };
}

/** El tipo de documento sigue activo en su catálogo; si no cambió, no se revisa. */
export async function assertCatalogs(
  tx: TenantTransaction,
  input: PartyData,
  before: PartyRow | null,
): Promise<void> {
  if (
    input.id_type !== null &&
    input.id_type !== before?.idType &&
    !(await isActiveCatalogCode(tx, 'identification_types', input.id_type))
  ) {
    throw catalogValueInvalid('El tipo de documento');
  }
}

/** Tipo y número de documento únicos por empresa, contando los fusionados (ficha 17.3). */
export async function assertUniqueId(
  tx: TenantTransaction,
  input: PartyData,
  selfId: string | null,
): Promise<void> {
  if (input.id_type === null || input.id_number === null) return;
  const taken = await tx.party.count({
    where: {
      idType: input.id_type,
      idNumber: input.id_number,
      ...(selfId === null ? {} : { NOT: { id: selfId } }),
    },
  });
  if (taken > 0) throw partyDuplicate();
}

/** Dos registros simultáneos del mismo documento: decide el índice único y se responde 409. */
export function duplicateOnConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw partyDuplicate();
  }
  throw error;
}
