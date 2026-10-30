import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { chainIntact, linkHash, type ChainLink, type StoredLink } from './signature-chain.js';

const GENESIS = createHash('sha256').update('documento').digest('hex');

function chainOf(links: readonly ChainLink[]): StoredLink[] {
  let previous = GENESIS;
  return links.map((link) => {
    const hash = linkHash(previous, link);
    const stored = { ...link, prevHash: previous, hash };
    previous = hash;
    return stored;
  });
}

function event(sequence: number, type: string): ChainLink {
  return {
    envelopeId: '0195f3a2-7c41-7b9e-9d2a-3f4e5a6b7c8d',
    signerId: null,
    sequence,
    type,
    ip: '190.0.0.1',
    userAgent: 'Navegador',
    occurredAt: new Date(Date.UTC(2026, 9, 30, 15, sequence)),
    details: { b: 1, a: 'x' },
  };
}

const CHAIN = chainOf([event(1, 'created'), event(2, 'sent'), event(3, 'signed')]);

describe('cadena de eventos de la firma', () => {
  it('una cadena sin cambios está intacta', () => {
    expect(chainIntact(GENESIS, CHAIN)).toBe(true);
    expect(chainIntact(GENESIS, [])).toBe(true);
  });

  it('el orden de las claves de los detalles no cambia la huella', () => {
    const first = event(1, 'created');
    const reordered = { ...first, details: { a: 'x', b: 1 } };
    expect(linkHash(GENESIS, reordered)).toBe(linkHash(GENESIS, first));
  });

  it('cambiar un dato de un evento rompe la cadena', () => {
    const [first, second, third] = CHAIN;
    if (first === undefined || second === undefined || third === undefined) throw new Error('');
    expect(chainIntact(GENESIS, [first, { ...second, ip: '10.0.0.1' }, third])).toBe(false);
    expect(chainIntact(GENESIS, [first, second, { ...third, type: 'rejected' }])).toBe(false);
  });

  it('quitar o reordenar un evento rompe la cadena', () => {
    const [first, second, third] = CHAIN;
    if (first === undefined || second === undefined || third === undefined) throw new Error('');
    expect(chainIntact(GENESIS, [first, third])).toBe(false);
    expect(chainIntact(GENESIS, [second, first, third])).toBe(false);
  });

  it('la cadena queda atada al documento: con otra huella de origen no cuadra', () => {
    const other = createHash('sha256').update('otro documento').digest('hex');
    expect(chainIntact(other, CHAIN)).toBe(false);
  });
});
