import { createHash } from 'node:crypto';

// Cadena de eventos de la firma (numeral 19.3): cada evento guarda la huella del anterior y su
// propia huella, calculada sobre sus datos y esa huella anterior. El primer eslabón parte de la
// huella del documento, así la cadena queda atada al PDF que se firma. Cambiar, quitar o reordenar
// un evento rompe todas las huellas que siguen.

export interface ChainLink {
  readonly envelopeId: string;
  readonly signerId: string | null;
  readonly sequence: number;
  readonly type: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly occurredAt: Date;
  readonly details: Readonly<Record<string, string | number | boolean | null>>;
}

export interface StoredLink extends ChainLink {
  readonly prevHash: string;
  readonly hash: string;
}

/** Texto canónico del evento: claves en orden fijo, fechas en ISO 8601 UTC. */
function canonical(link: ChainLink): string {
  const details = Object.fromEntries(
    Object.entries(link.details).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify([
    link.envelopeId,
    link.signerId,
    link.sequence,
    link.type,
    link.ip,
    link.userAgent,
    link.occurredAt.toISOString(),
    details,
  ]);
}

export function linkHash(prevHash: string, link: ChainLink): string {
  return createHash('sha256').update(prevHash).update('\n').update(canonical(link)).digest('hex');
}

/** La cadena está completa, en orden, y ningún evento cambió desde que se registró. */
export function chainIntact(genesis: string, links: readonly StoredLink[]): boolean {
  let previous = genesis;
  for (const [index, link] of links.entries()) {
    if (link.sequence !== index + 1 || link.prevHash !== previous) return false;
    if (linkHash(previous, link) !== link.hash) return false;
    previous = link.hash;
  }
  return true;
}
