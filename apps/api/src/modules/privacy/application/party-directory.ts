import type { PersonalDataRecord } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { ErasureActor, ErasureOutcome } from './personal-data-sources.js';

/** Un tercero, como lo necesita privacidad: para mostrarlo y para validar encargados. */
export interface PartyRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: 'person' | 'organization';
  /** Falso si se retiró o se fusionó en otro. */
  readonly isCurrent: boolean;
}

/** La ficha de un titular para entregarle sus datos (B42). */
export interface HolderRecord {
  readonly name: string;
  readonly email: string | null;
  readonly record: PersonalDataRecord;
}

/**
 * Consulta de terceros. Terceros ya depende de privacidad para registrar las autorizaciones de
 * sus formularios; para no depender de vuelta, privacidad pide los terceros por este puerto y el
 * módulo de terceros lo implementa.
 */
export interface PartyDirectory {
  describe(tx: TenantTransaction, ids: readonly string[]): Promise<Map<string, PartyRecord>>;
  /** Lo que la ficha guarda de la persona; null si no existe. */
  holder(tx: TenantTransaction, id: string): Promise<HolderRecord | null>;
  /**
   * Cierra la supresión en la ficha: si otro módulo debe conservar datos, la bloquea con ese
   * motivo; si no, la vuelve anónima (B42, decisión 8).
   */
  settleErasure(
    tx: TenantTransaction,
    id: string,
    blockReason: string | null,
    actor: ErasureActor,
  ): Promise<ErasureOutcome>;
}

export const PARTY_DIRECTORY = Symbol('PARTY_DIRECTORY');
