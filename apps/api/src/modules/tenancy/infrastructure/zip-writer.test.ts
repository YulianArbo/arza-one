import { createHash } from 'node:crypto';
import { PassThrough, Readable } from 'node:stream';
import { crc32, inflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { ZipWriter } from './zip-writer.js';

interface ReadEntry {
  readonly name: string;
  readonly content: Buffer;
  readonly crc: number;
}

/** Lector mínimo de ZIP para la prueba: directorio central y deflate. */
function readZip(zip: Buffer): ReadEntry[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const entries: ReadEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50);
    const crc = zip.readUInt32LE(at + 16);
    const compressed = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const offset = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const localName = zip.readUInt16LE(offset + 26);
    const dataStart = offset + 30 + localName;
    const content = inflateRawSync(zip.subarray(dataStart, dataStart + compressed));
    entries.push({ name, content, crc });
    at += 46 + nameLength;
  }
  return entries;
}

async function zipOf(build: (zip: ZipWriter) => Promise<void>): Promise<Buffer> {
  const out = new PassThrough();
  const chunks: Buffer[] = [];
  out.on('data', (chunk: Buffer) => chunks.push(chunk));
  const zip = new ZipWriter(out, new Date('2026-11-27T15:30:00Z'));
  await build(zip);
  await zip.finish();
  return Buffer.concat(chunks);
}

describe('ZipWriter (B48)', () => {
  it('escribe entradas que un lector ZIP abre con su contenido y su CRC', async () => {
    const big = Buffer.alloc(300_000, 'ñ');
    const results: { name: string; sha256: string; sizeBytes: number }[] = [];
    const zip = await zipOf(async (writer) => {
      results.push(
        await writer.add('tablas/core_sites.csv', Readable.from(['id;nombre\r\n', '1;Sede\r\n'])),
      );
      results.push(await writer.add('archivos/año/foto.png', Readable.from([big])));
    });
    const entries = readZip(zip);
    expect(entries.map((entry) => entry.name)).toEqual([
      'tablas/core_sites.csv',
      'archivos/año/foto.png',
    ]);
    expect(entries[0]?.content.toString('utf8')).toBe('id;nombre\r\n1;Sede\r\n');
    expect(entries[1]?.content.equals(big)).toBe(true);
    for (const entry of entries) expect(entry.crc).toBe(crc32(entry.content));
    expect(results[1]?.sizeBytes).toBe(big.length);
    expect(results[1]?.sha256).toBe(createHash('sha256').update(big).digest('hex'));
  });

  it('un ZIP sin entradas es válido', async () => {
    const zip = await zipOf(() => Promise.resolve());
    expect(zip).toHaveLength(22);
    expect(readZip(zip)).toEqual([]);
  });

  it('si la fuente falla, la entrada falla y no se queda esperando', async () => {
    async function* broken(): AsyncGenerator<Buffer> {
      yield Buffer.from('parte');
      await Promise.resolve();
      throw new Error('fuente rota');
    }
    const out = new PassThrough();
    out.resume();
    const writer = new ZipWriter(out, new Date());
    await expect(writer.add('x.csv', broken())).rejects.toThrow('fuente rota');
  });
});
