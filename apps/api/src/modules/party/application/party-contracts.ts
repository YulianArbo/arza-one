import type { Party } from '../../../generated/prisma/client.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { toCalendarDate } from '../../core/index.js';
import { partyName } from './party-support.js';

// El tercero como lo necesita un contrato (B24, ficha 17.7): nombre, documento, dirección y quiénes
// firman por él (los contactos marcados como firmantes autorizados). Contratos llega aquí por el
// index.ts del módulo, dentro de su propia transacción.

interface ContractSigner {
  /** La persona en Terceros: firma electrónica (B25) la guarda como firmante. */
  readonly personId: string;
  readonly name: string;
  /** «CC 1020304050», o null si el contacto no tiene documento. */
  readonly document: string | null;
  /** El correo registrado, al que llega el enlace de firma; null si no lo tiene. */
  readonly email: string | null;
}

export interface ContractParty {
  readonly id: string;
  readonly name: string;
  /** «NIT 900123456-7», «CC 1020304050», o null si es un prospecto sin documento. */
  readonly document: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly email: string | null;
  /** Se puede contratar con él: no se retiró, no se fusionó y no está bloqueado. */
  readonly isUsable: boolean;
  readonly signers: readonly ContractSigner[];
}

function documentText(party: Party): string | null {
  if (party.idType === null || party.idNumber === null) return null;
  const digit = party.checkDigit === null ? '' : `-${String(party.checkDigit)}`;
  return `${party.idType} ${party.idNumber}${digit}`;
}

/** El tercero vigente para un contrato, o null si no existe en la empresa. */
export async function contractParty(
  tx: TenantTransaction,
  partyId: string,
): Promise<ContractParty | null> {
  const party = await tx.party.findFirst({ where: { id: partyId } });
  if (party === null) return null;
  const contacts =
    party.kind === 'organization'
      ? await tx.contact.findMany({
          where: { organizationId: party.id, canSign: true, deletedAt: null },
          include: { person: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
  const signers = contacts
    .filter((contact) => contact.person.deletedAt === null)
    .map((contact) => signerOf(contact.person));
  return {
    id: party.id,
    name: partyName(party),
    document: documentText(party),
    address: party.address,
    city: party.city,
    email: party.email,
    isUsable: party.deletedAt === null && party.status !== 'blocked' && party.status !== 'inactive',
    // Una persona firma por sí misma.
    signers: party.kind === 'person' ? [signerOf(party)] : signers,
  };
}

function signerOf(person: Party): ContractSigner {
  return {
    personId: person.id,
    name: partyName(person),
    document: documentText(person),
    email: person.email,
  };
}

/** El conocimiento del tercero vigente está aprobado (numeral 19.4): su última revisión. */
export async function partyVerified(
  tx: TenantTransaction,
  partyId: string,
  today: string,
): Promise<boolean> {
  const latest = await tx.dueDiligence.findFirst({
    where: { partyId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (latest?.status !== 'approved') return false;
  return latest.nextReviewOn === null || toCalendarDate(latest.nextReviewOn) >= today;
}

/** La persona de Terceros con ese número de documento, para vincularla con su cuenta. */
export async function personByDocument(
  tx: TenantTransaction,
  idNumber: string,
): Promise<ContractSigner | null> {
  const person = await tx.party.findFirst({
    where: { kind: 'person', idNumber, deletedAt: null },
  });
  return person === null ? null : signerOf(person);
}

/** Nombre, documento y correo de una persona de Terceros, para quien firma por la empresa. */
export async function signingPerson(
  tx: TenantTransaction,
  personId: string,
): Promise<ContractSigner | null> {
  const person = await tx.party.findFirst({ where: { id: personId, kind: 'person' } });
  return person === null ? null : signerOf(person);
}
