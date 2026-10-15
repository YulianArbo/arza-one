import { connect } from 'node:net';

// Cliente mínimo del antivirus ClamAV (capítulo 8): envía el contenido por la orden INSTREAM del
// demonio clamd y lee su veredicto. Sin biblioteca externa: el protocolo son unas pocas líneas.

export interface ClamavOptions {
  readonly host: string;
  readonly port: number;
  readonly timeoutMs: number;
}

export type ScanVerdict =
  { readonly infected: false } | { readonly infected: true; readonly signature: string };

/** clamd acepta trozos de hasta 25 MB por defecto; se envían más pequeños. */
const CHUNK_BYTES = 64 * 1024;

function frames(content: Buffer): Buffer[] {
  const parts: Buffer[] = [Buffer.from('zINSTREAM\0')];
  for (let offset = 0; offset < content.length; offset += CHUNK_BYTES) {
    const chunk = content.subarray(offset, offset + CHUNK_BYTES);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(chunk.length);
    parts.push(length, chunk);
  }
  // Un trozo de longitud cero cierra el envío.
  parts.push(Buffer.alloc(4));
  return parts;
}

/** Interpreta «stream: OK» o «stream: <firma> FOUND»; cualquier otra respuesta es un error. */
function parseVerdict(reply: string): ScanVerdict {
  const text = reply.replace(/\0/g, '').trim();
  if (text === 'stream: OK') return { infected: false };
  const found = /^stream: (.+) FOUND$/.exec(text);
  if (found?.[1] !== undefined) return { infected: true, signature: found[1] };
  throw new Error(`El antivirus no pudo analizar el archivo: ${text}`);
}

/** Analiza el contenido. Si el antivirus no responde, falla: nunca se da un archivo por bueno. */
export async function scanWithClamav(
  options: ClamavOptions,
  content: Buffer,
): Promise<ScanVerdict> {
  const reply = await new Promise<string>((resolve, reject) => {
    const socket = connect({ host: options.host, port: options.port });
    const received: Buffer[] = [];
    socket.setTimeout(options.timeoutMs, () => {
      socket.destroy(new Error('El antivirus no respondió a tiempo.'));
    });
    socket.on('data', (data) => received.push(data));
    socket.on('error', reject);
    socket.on('end', () => {
      resolve(Buffer.concat(received).toString('utf8'));
    });
    // Sin cerrar nuestro lado: tras ese aviso, la red de Docker corta antes de la respuesta.
    // clamd cierra la conexión después de responder.
    socket.on('connect', () => {
      for (const part of frames(content)) socket.write(part);
    });
  });
  return parseVerdict(reply);
}
