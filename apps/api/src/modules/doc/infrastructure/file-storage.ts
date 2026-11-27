import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

// Almacenamiento privado de archivos (ADR-013): Garage con interfaz S3. Ningún objeto es público;
// la API y el worker son los únicos que lo alcanzan.

export interface FileStorageOptions {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export interface StoredObject {
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export class FileStorage {
  private readonly client: S3Client;

  constructor(private readonly options: FileStorageOptions) {
    const { endpoint, region, accessKeyId, secretAccessKey } = options;
    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }

  /** Guarda el contenido tal como llega, sin cargarlo entero en memoria. */
  async put(object: StoredObject, body: Readable): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: object.key,
        Body: body,
        ContentLength: object.sizeBytes,
        ContentType: object.contentType,
      }),
    );
  }

  /** El contenido para entregarlo poco a poco en una descarga. */
  async stream(key: string): Promise<Readable> {
    const { Body } = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    if (!(Body instanceof Readable)) throw new Error(`El objeto ${key} no trajo contenido.`);
    return Body;
  }

  /** El contenido completo, para analizarlo (como máximo el límite de tamaño de la lista blanca). */
  async read(key: string): Promise<Buffer> {
    const { Body } = await this.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: key }),
    );
    if (Body === undefined) throw new Error(`El objeto ${key} no trajo contenido.`);
    return Buffer.from(await Body.transformToByteArray());
  }

  /** Llaves y tamaños de todos los objetos que empiezan por el prefijo (B48: los de una empresa). */
  async list(prefix: string): Promise<{ key: string; sizeBytes: number }[]> {
    const found: { key: string; sizeBytes: number }[] = [];
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.options.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const item of page.Contents ?? []) {
        if (item.Key !== undefined) found.push({ key: item.Key, sizeBytes: item.Size ?? 0 });
      }
      token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
    } while (token !== undefined);
    return found;
  }

  /** Borra todos los objetos del prefijo. Devuelve cuántos borró. */
  async deletePrefix(prefix: string): Promise<number> {
    if (prefix.length < 10 || !prefix.endsWith('/')) {
      throw new Error('El prefijo a borrar debe ser la carpeta de una empresa.');
    }
    const objects = await this.list(prefix);
    for (const object of objects) await this.delete(object.key);
    return objects.length;
  }

  /** Borra el objeto; si ya no existe, no pasa nada. */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
  }
}

/** Almacenamiento con las variables S3_* del entorno (anexo F); lo usan la API y el worker. */
export function fileStorageFrom(env: {
  readonly S3_ENDPOINT: string;
  readonly S3_REGION: string;
  readonly S3_BUCKET: string;
  readonly S3_ACCESS_KEY: string;
  readonly S3_SECRET_KEY: string;
}): FileStorage {
  return new FileStorage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  });
}
