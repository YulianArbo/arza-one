import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

/** Un tercero, como lo necesitan los expedientes y los vínculos: para mostrarlo y validarlo. */
export interface DocParty {
  readonly id: string;
  readonly name: string;
  /** Falso si se retiró o se fusionó en otro. */
  readonly isCurrent: boolean;
}

/**
 * Consulta de terceros para la gestión documental (B18). Terceros depende de privacidad, que
 * depende de documentos; para no cerrar el círculo, documentos pide los terceros por este puerto
 * y el módulo de terceros lo implementa.
 */
export interface DocPartyLookup {
  describe(tx: TenantTransaction, ids: readonly string[]): Promise<Map<string, DocParty>>;
}

export const DOC_PARTY_LOOKUP = Symbol('DOC_PARTY_LOOKUP');
