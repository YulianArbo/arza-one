import { createHash, randomBytes } from 'node:crypto';

import type { Redis } from 'ioredis';
import { z } from 'zod';

// Enlaces temporales de subida y descarga (numeral 13.2, ADR-013). La llave solo viaja en el
// enlace; Valkey guarda su huella con el archivo, la empresa y el vencimiento, y la borra sola
// al vencer.

const linkSchema = z.object({
  purpose: z.enum(['upload', 'download']),
  tenantId: z.uuid(),
  userId: z.uuid(),
  fileId: z.uuid(),
  expiresAt: z.iso.datetime(),
});

export type FileLink = z.infer<typeof linkSchema>;

function keyOf(token: string): string {
  return `doc:file-link:${createHash('sha256').update(token).digest('hex')}`;
}

export class FileLinks {
  constructor(private readonly valkey: Pick<Redis, 'set' | 'get' | 'del'>) {}

  /** Guarda el enlace y devuelve su llave, que no se puede adivinar (256 bits). */
  async issue(link: FileLink, ttlMs: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.valkey.set(keyOf(token), JSON.stringify(link), 'PX', ttlMs);
    return token;
  }

  /** El enlace de esa llave, o null si no existe, ya se usó o Valkey ya lo borró. */
  async find(token: string): Promise<FileLink | null> {
    const stored = await this.valkey.get(keyOf(token));
    if (stored === null) return null;
    const parsed = linkSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  }

  /** Un enlace de subida sirve una sola vez. */
  async consume(token: string): Promise<void> {
    await this.valkey.del(keyOf(token));
  }
}
