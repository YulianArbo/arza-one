import { Injectable } from '@nestjs/common';
import type { PersonalDataOutcome, PersonalDataRecord } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';

// Los datos de un titular viven en varios módulos (B42, decisiones 6 y 8). Privacidad no lee sus
// tablas: cada módulo registra aquí una fuente que entrega lo que guarda de la persona, con
// etiquetas en español, y que suprime lo que se puede suprimir o informa por qué se conserva.
// Muchos módulos ya dependen de privacidad; así privacidad no depende de vuelta de ellos.

/** A quién se buscan los datos: su ficha en Terceros y los correos con que escribió. */
export interface PersonalDataHolder {
  readonly partyId: string;
  readonly emails: readonly string[];
}

export interface ErasureActor {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly meta: RequestMeta | null;
  readonly at: Date;
  /** Código de la solicitud que ordena la supresión, para la auditoría. */
  readonly requestCode: string;
}

export interface ErasureOutcome {
  readonly outcome: PersonalDataOutcome;
  readonly count: number;
  /** Por qué se bloquea o se conserva; vacío si se suprimió o no había datos. */
  readonly reason: string | null;
  /** Archivos retirados que se borran del almacenamiento después de la transacción. */
  readonly storageKeys?: readonly string[];
}

export interface PersonalDataSource {
  /** Clave estable de la sección, por ejemplo «crm». */
  readonly key: string;
  readonly title: string;
  collect(tx: TenantTransaction, holder: PersonalDataHolder): Promise<PersonalDataRecord[]>;
  /** Suprime lo que puede; lo que la ley obliga a conservar lo informa como bloqueado. */
  erase(
    tx: TenantTransaction,
    holder: PersonalDataHolder,
    actor: ErasureActor,
  ): Promise<ErasureOutcome>;
}

/** Sin registros: «Sin datos»; si no, el resultado dado. */
export function outcomeFor(
  count: number,
  outcome: PersonalDataOutcome,
  reason: string | null = null,
): ErasureOutcome {
  return count === 0 ? { outcome: 'none', count: 0, reason: null } : { outcome, count, reason };
}

/** Fecha y hora como se muestran en Colombia, para el archivo del titular. */
export function shownDateTime(value: Date | null): string | null {
  if (value === null) return null;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

/** Fecha de calendario dd/mm/aaaa. */
export function shownDate(value: Date | null): string | null {
  if (value === null) return null;
  const [year, month, day] = value.toISOString().slice(0, 10).split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/**
 * Registro de las fuentes. Cada módulo registra la suya al iniciar; el orden de la entrega es el
 * de las claves, para que el archivo salga siempre igual.
 */
@Injectable()
export class PersonalDataRegistry {
  private readonly sources = new Map<string, PersonalDataSource>();

  register(source: PersonalDataSource): void {
    if (this.sources.has(source.key)) throw new Error(`Fuente repetida: ${source.key}`);
    this.sources.set(source.key, source);
  }

  list(): PersonalDataSource[] {
    return [...this.sources.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
}
