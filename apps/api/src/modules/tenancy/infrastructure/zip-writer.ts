import { createHash, type Hash } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import { crc32, createDeflateRaw, type DeflateRaw } from 'node:zlib';

// Archivo ZIP escrito por partes (B48, decisión 5), sin cargarlo entero en memoria y sin
// dependencias: cada entrada se comprime con deflate y lleva su descriptor de datos al final
// (bit 3), así no hace falta conocer su tamaño antes. Formato ZIP clásico: hasta 4 GB y 65.535
// entradas; si una exportación los supera, falla con un mensaje claro.

const LOCAL_HEADER = 0x04034b50;
const DATA_DESCRIPTOR = 0x08074b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
/** Descriptor de datos (bit 3) y nombres en UTF-8 (bit 11). */
const FLAGS = 0x0808;
const DEFLATE = 8;
const VERSION = 20;
const MAX_32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;

export interface ZipEntryResult {
  readonly name: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

interface CentralEntry {
  readonly name: Buffer;
  readonly crc: number;
  readonly compressed: number;
  readonly size: number;
  readonly offset: number;
  readonly time: number;
  readonly date: number;
}

/** Fecha y hora en el formato de MS-DOS que usa ZIP. */
function dosDateTime(at: Date): { time: number; date: number } {
  const time = (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | (at.getUTCSeconds() >> 1);
  const date =
    ((at.getUTCFullYear() - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate();
  return { time, date };
}

interface Tally {
  crc: number;
  size: number;
  compressed: number;
  readonly digest: Hash;
}

/** Pasa la fuente a la compresión. Si la fuente falla, la compresión también: nadie espera. */
async function feed(
  deflate: DeflateRaw,
  content: AsyncIterable<Buffer | string>,
  tally: Tally,
): Promise<void> {
  try {
    for await (const chunk of content) {
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
      tally.crc = crc32(bytes, tally.crc);
      tally.size += bytes.length;
      tally.digest.update(bytes);
      if (!deflate.write(bytes)) await new Promise((resolve) => deflate.once('drain', resolve));
    }
    deflate.end();
  } catch (error) {
    deflate.destroy(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

function tooLarge(): Error {
  return new Error('La exportación supera 4 GB o 65.535 archivos; el formato ZIP no la admite.');
}

export class ZipWriter {
  private offset = 0;
  private readonly entries: CentralEntry[] = [];

  constructor(
    private readonly out: Writable,
    private readonly at: Date,
  ) {}

  /** Bytes escritos hasta ahora. */
  get size(): number {
    return this.offset;
  }

  /** Agrega una entrada con el contenido que llega por partes. */
  async add(
    name: string,
    content: Readable | AsyncIterable<Buffer | string>,
  ): Promise<ZipEntryResult> {
    if (this.entries.length >= MAX_ENTRIES) throw tooLarge();
    const nameBytes = Buffer.from(name, 'utf8');
    const { time, date } = dosDateTime(this.at);
    const offset = this.offset;
    await this.write(this.localHeader(nameBytes, time, date));
    const tally: Tally = { crc: 0, size: 0, compressed: 0, digest: createHash('sha256') };
    await this.compress(content as AsyncIterable<Buffer | string>, tally);
    const { crc, size, compressed } = tally;
    if (size > MAX_32 || compressed > MAX_32 || this.offset > MAX_32) throw tooLarge();
    await this.write(this.descriptor(crc, compressed, size));
    this.entries.push({ name: nameBytes, crc, compressed, size, offset, time, date });
    return { name, sizeBytes: size, sha256: tally.digest.digest('hex') };
  }

  /** Comprime la fuente hacia la salida y lleva la cuenta de CRC, tamaños y huella. */
  private async compress(content: AsyncIterable<Buffer | string>, tally: Tally): Promise<void> {
    const deflate = createDeflateRaw();
    const pump = feed(deflate, content, tally);
    try {
      for await (const piece of deflate as AsyncIterable<Buffer>) {
        tally.compressed += piece.length;
        await this.write(piece);
      }
    } catch (error) {
      // El error de la fuente ya llega aquí; la promesa de la fuente se espera para no dejarla suelta.
      await pump.catch(() => undefined);
      throw error;
    }
    await pump;
  }

  /** Escribe el directorio central y cierra la salida. */
  async finish(): Promise<void> {
    const start = this.offset;
    for (const entry of this.entries) await this.write(this.centralHeader(entry));
    const length = this.offset - start;
    if (this.offset > MAX_32) throw tooLarge();
    const end = Buffer.alloc(22);
    end.writeUInt32LE(END_OF_CENTRAL, 0);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(length, 12);
    end.writeUInt32LE(start, 16);
    await this.write(end);
    await new Promise<void>((resolve, reject) => {
      this.out.once('error', reject);
      this.out.end(resolve);
    });
  }

  private localHeader(name: Buffer, time: number, date: number): Buffer {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(LOCAL_HEADER, 0);
    header.writeUInt16LE(VERSION, 4);
    header.writeUInt16LE(FLAGS, 6);
    header.writeUInt16LE(DEFLATE, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt16LE(name.length, 26);
    return Buffer.concat([header, name]);
  }

  private descriptor(crc: number, compressed: number, size: number): Buffer {
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(DATA_DESCRIPTOR, 0);
    descriptor.writeUInt32LE(crc >>> 0, 4);
    descriptor.writeUInt32LE(compressed, 8);
    descriptor.writeUInt32LE(size, 12);
    return descriptor;
  }

  private centralHeader(entry: CentralEntry): Buffer {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(CENTRAL_HEADER, 0);
    header.writeUInt16LE(VERSION, 4);
    header.writeUInt16LE(VERSION, 6);
    header.writeUInt16LE(FLAGS, 8);
    header.writeUInt16LE(DEFLATE, 10);
    header.writeUInt16LE(entry.time, 12);
    header.writeUInt16LE(entry.date, 14);
    header.writeUInt32LE(entry.crc >>> 0, 16);
    header.writeUInt32LE(entry.compressed, 20);
    header.writeUInt32LE(entry.size, 24);
    header.writeUInt16LE(entry.name.length, 28);
    header.writeUInt32LE(entry.offset, 42);
    return Buffer.concat([header, entry.name]);
  }

  private async write(bytes: Buffer): Promise<void> {
    this.offset += bytes.length;
    if (!this.out.write(bytes)) await new Promise((resolve) => this.out.once('drain', resolve));
  }
}
