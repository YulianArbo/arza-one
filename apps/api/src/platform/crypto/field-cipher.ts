import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

// Cifrado de campos sensibles (capítulo 12.1): secretos del segundo factor y, más adelante,
// cuentas bancarias y datos de salud. AES-256-GCM con la llave FIELD_ENCRYPTION_KEY, que vive en
// las variables de entorno y nunca en la base de datos (anexo F).

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
/** Etiqueta de autenticación completa (128 bits): no se acepta una más corta. */
const TAG_BYTES = 16;
/** Versión de la llave en cada valor: permite rotarla más adelante sin perder lo cifrado. */
const VERSION = 'v1';
const KEY_INFO = 'arza-one/field-encryption/v1';

export class FieldCipherError extends Error {
  constructor() {
    super('No se pudo descifrar el campo: la llave o el contexto no coinciden.');
    this.name = 'FieldCipherError';
  }
}

/**
 * Cifra y descifra campos. Cada valor queda atado a un contexto (por ejemplo, la tabla, la
 * empresa y el usuario): copiar el valor cifrado a otra fila no sirve, porque no descifra.
 */
export class FieldCipher {
  private readonly key: Buffer;

  constructor(secret: string) {
    // La variable puede venir en hexadecimal o base64; HKDF la convierte en una llave de 256 bits.
    this.key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), KEY_INFO, KEY_BYTES));
  }

  encrypt(plaintext: string, context: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, { authTagLength: TAG_BYTES });
    cipher.setAAD(Buffer.from(context));
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const parts = [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url'));
    return [VERSION, ...parts].join('.');
  }

  decrypt(stored: string, context: string): string {
    const [version, iv, tag, encrypted] = stored.split('.');
    if (version !== VERSION || iv === undefined || tag === undefined || encrypted === undefined) {
      throw new FieldCipherError();
    }
    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64url'), {
        authTagLength: TAG_BYTES,
      });
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      throw new FieldCipherError();
    }
  }
}
