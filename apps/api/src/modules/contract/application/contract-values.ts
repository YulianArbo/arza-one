import { amountInWords, type ContractValues } from '@arza/contracts';
import { pesos, printedDate } from '@arza/templates';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { companyIdentity } from '../../core/index.js';
import { acceptedQuote, type ContractQuote } from '../../crm/index.js';
import { contractParty, type ContractParty } from '../../party/index.js';
import { partyDocumentMissing, partyInvalid, quoteInvalid } from './contract-messages.js';

// Los valores con que se llenan las variables de las cláusulas (B24). Salen de la empresa, del
// cliente en Terceros, de la cotización aceptada y de lo que se escribió en el asistente; se
// guardan con el contrato tal como se imprimieron.

/** Lo que el asistente aporta a las variables. */
export interface ContractData {
  readonly code: string;
  readonly object: string;
  readonly value: string | null;
  readonly paymentTerms: string | null;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly signerName: string;
  readonly signerDocument: string;
}

const NO_VALUE = 'sin valor';
const NO_QUOTE = 'lo descrito en esta cláusula';

/** El cliente vigente, con su documento: sin él no hay contrato. */
export async function usableParty(tx: TenantTransaction, partyId: string): Promise<ContractParty> {
  const party = await contractParty(tx, partyId);
  if (!party?.isUsable) throw partyInvalid();
  if (party.document === null) throw partyDocumentMissing();
  return party;
}

/** La cotización aceptada del mismo cliente, o null si el contrato no sale de una cotización. */
export async function sourceQuote(
  tx: TenantTransaction,
  quoteId: string | null,
  partyId: string,
): Promise<ContractQuote | null> {
  if (quoteId === null) return null;
  const quote = await acceptedQuote(tx, quoteId);
  if (quote?.partyId !== partyId) throw quoteInvalid();
  return quote;
}

export function quoteReference(
  quote: Pick<ContractQuote, 'code' | 'versionNumber'> | null,
): string {
  if (quote === null) return NO_QUOTE;
  return `la cotización ${quote.code} versión ${String(quote.versionNumber)}`;
}

export async function contractValues(
  tx: TenantTransaction,
  party: ContractParty,
  data: ContractData,
  quoteText: string,
): Promise<ContractValues> {
  const company = await companyIdentity(tx);
  return {
    codigo_contrato: data.code,
    empresa_razon_social: company.legalName,
    empresa_nit: `NIT ${company.taxId}`,
    cliente_nombre: party.name,
    cliente_documento: party.document ?? '',
    cliente_direccion: party.address ?? 'la dirección registrada',
    cliente_ciudad: party.city ?? 'Colombia',
    cliente_correo: party.email ?? 'el correo registrado',
    cliente_representante: data.signerName,
    cliente_representante_documento: data.signerDocument,
    objeto: data.object,
    valor: data.value === null ? NO_VALUE : pesos(data.value),
    valor_letras: data.value === null ? NO_VALUE : amountInWords(data.value),
    forma_pago: data.paymentTerms ?? NO_VALUE,
    fecha_inicio: printedDate(data.startsOn),
    fecha_fin: printedDate(data.endsOn),
    cotizacion: quoteText,
  };
}
