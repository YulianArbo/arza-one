import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

/** Un tercero, como lo necesita privacidad: para mostrarlo y para validar encargados. */
export interface PartyRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: 'person' | 'organization';
  /** Falso si se retiró o se fusionó en otro. */
  readonly isCurrent: boolean;
}

/**
 * Consulta de terceros. Terceros ya depende de privacidad para registrar las autorizaciones de
 * sus formularios; para no depender de vuelta, privacidad pide los terceros por este puerto y el
 * módulo de terceros lo implementa.
 */
export interface PartyDirectory {
  describe(tx: TenantTransaction, ids: readonly string[]): Promise<Map<string, PartyRecord>>;
}

export const PARTY_DIRECTORY = Symbol('PARTY_DIRECTORY');
