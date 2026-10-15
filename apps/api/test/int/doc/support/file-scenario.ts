import {
  downloadLinkResponseSchema,
  fileSchema,
  uploadLinkResponseSchema,
  type DownloadLinkResponse,
  type FileView,
  type UploadLinkResponse,
} from '@arza/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { expect, inject } from 'vitest';

import {
  scanUploadedFile,
  scanWithClamav,
  type FileScanResult,
} from '../../../../src/modules/doc/index.js';
import { FileStorage } from '../../../../src/modules/doc/infrastructure/file-storage.js';
import { apiDatabase } from '../../support/integration-database.js';
import { WEB_ORIGIN, freshIp } from '../../iam/support/iam-fixtures.js';
import { AccessScenario, type Person } from '../../iam/support/access-scenario.js';

// Escenario de las pruebas de archivos (B14): la API completa con Garage y ClamAV reales. El
// análisis del worker se ejecuta aquí con la misma función que usa el worker.

/**
 * Archivo de ensayo EICAR: la cadena que todo antivirus reconoce como «virus de prueba», sin
 * serlo. Se arma en memoria para que el antivirus del equipo no borre este archivo del repositorio.
 */
export function eicar(): Buffer {
  return Buffer.from(
    [
      'X5O!P%@AP[4',
      String.raw`\PZX54(P^)7CC)7}$`,
      'EICAR-STANDARD-ANTIVIRUS',
      '-TEST-FILE!$H+H*',
    ].join(''),
  );
}

/** Un PDF mínimo; basta con su cabecera para el reconocimiento del tipo. */
export function samplePdf(text = 'Informe de prueba'): Buffer {
  return Buffer.from(`%PDF-1.7\n% ${text} ${uuidv7()}\n%%EOF\n`);
}

export interface SampleFile {
  readonly name: string;
  readonly type: string;
  readonly content: Buffer;
}

export function pdfFile(content = samplePdf()): SampleFile {
  return { name: 'Informe de visita.pdf', type: 'application/pdf', content };
}

/** El mismo Garage que usa la API de pruebas, para revisar lo guardado. */
export function storage(): FileStorage {
  return new FileStorage(inject('storage'));
}

export class FileScenario extends AccessScenario {
  /** Persona de calidad: sube archivos (letra C) y ve todos los de la empresa. */
  uploader(tenantId = this.tenant.id): Promise<Person> {
    return this.person('calidad', ['CALIDAD'], { tenantId });
  }

  async requestUpload(person: Person, file: SampleFile): Promise<UploadLinkResponse> {
    const response = await this.post('/v1/files', person.session, {
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.content.length,
    });
    expect(response.status, response.text).toBe(201);
    return uploadLinkResponseSchema.parse(response.body);
  }

  /** Envía el contenido al enlace de subida, sin sesión, como lo hace el navegador. */
  put(url: string, content: Buffer, type: string): request.Test {
    return request(this.app.getHttpServer())
      .put(new URL(url).pathname)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('Content-Type', type)
      .send(content);
  }

  /** Lo que hace el worker con el trabajo «doc.file-scan». */
  async scan(fileId: string): Promise<FileScanResult> {
    return scanUploadedFile(
      { tenantId: this.tenant.id, userId: null, correlationId: uuidv7(), fileId },
      {
        database: apiDatabase(),
        clock: this.clock,
        storage: storage(),
        antivirus: async (content) =>
          scanWithClamav({ ...inject('antivirus'), timeoutMs: 10_000 }, content),
      },
    );
  }

  /** Sube el archivo de principio a fin y lo deja analizado. */
  async upload(person: Person, file: SampleFile): Promise<{ id: string; result: FileScanResult }> {
    const link = await this.requestUpload(person, file);
    const sent = await this.put(link.upload_url, file.content, file.type);
    expect(sent.status, sent.text).toBe(204);
    return { id: link.id, result: await this.scan(link.id) };
  }

  async file(person: Person, id: string): Promise<FileView> {
    const response = await this.get(`/v1/files/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return fileSchema.parse(response.body);
  }

  async downloadLink(person: Person, id: string): Promise<DownloadLinkResponse> {
    const response = await this.post(`/v1/files/${id}/download-link`, person.session);
    expect(response.status, response.text).toBe(200);
    return downloadLinkResponseSchema.parse(response.body);
  }

  /** Descarga por el enlace, sin sesión, y devuelve el contenido como bytes. */
  fetchLink(url: string): request.Test {
    return request(this.app.getHttpServer())
      .get(new URL(url).pathname)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      });
  }
}
