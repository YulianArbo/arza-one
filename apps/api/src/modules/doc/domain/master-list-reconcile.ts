import type { ListingEntry } from './master-list-listing.js';

// Conciliación del Listado Maestro (B19, criterio del bloque y numeral 18.2): la plataforma debe
// coincidir con el RE-SGC-001 documento por documento, en nombre, versión, fecha y estado. El
// informe de importación dice «sin diferencias» solo si no queda ninguna.

/** Un documento del SGC tal como está en la plataforma. */
export interface PlatformEntry {
  readonly code: string;
  readonly title: string;
  readonly versionLabel: string | null;
  readonly effectiveDate: string | null;
  readonly status: string;
}

export interface Difference {
  readonly code: string;
  readonly problem: string;
}

function label(number: number): string {
  return String(number).padStart(2, '0');
}

function entryDifferences(entry: ListingEntry, found: PlatformEntry | undefined): string[] {
  if (found === undefined) return ['no está en la plataforma'];
  if (found.status !== 'current') return ['en la plataforma no está vigente'];
  const problems: string[] = [];
  if (found.title.trim() !== entry.title.trim()) problems.push('el nombre es distinto');
  if (found.versionLabel !== label(entry.number)) {
    problems.push(`la versión en la plataforma es ${found.versionLabel ?? 'ninguna'}`);
  }
  if (found.effectiveDate !== entry.effectiveDate) problems.push('la fecha es distinta');
  return problems;
}

export function differences(
  listing: readonly ListingEntry[],
  platform: readonly PlatformEntry[],
): Difference[] {
  const byCode = new Map(platform.map((entry) => [entry.code, entry]));
  const listed = new Set(listing.map((entry) => entry.code));
  const fromListing = listing.flatMap((entry) =>
    entryDifferences(entry, byCode.get(entry.code)).map((problem) => ({
      code: entry.code,
      problem,
    })),
  );
  const extra = platform
    .filter((entry) => entry.status === 'current' && !listed.has(entry.code))
    .map((entry) => ({
      code: entry.code,
      problem: 'está vigente en la plataforma y no en el listado',
    }));
  return [...fromListing, ...extra];
}
