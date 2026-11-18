import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { attachablePdfForSignature, FileNotReadyError } from '../../../src/modules/doc/index.js';
import { errorCode, MINUTE } from '../iam/support/iam-fixtures.js';
import { FileScenario, eicar, pdfFile, samplePdf, storage } from './support/file-scenario.js';

// Carga, análisis y descarga de archivos (B14, numeral 13.2) con Garage y ClamAV reales.

const scenario = new FileScenario('archivos');

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Un PDF queda disponible con su huella y solo quien lo cargó puede adjuntarlo a una firma. */
async function availablePdf(): Promise<void> {
  const person = await scenario.uploader();
  const content = samplePdf();
  const { id, result } = await scenario.upload(person, pdfFile(content));
  expect(result).toBe('available');
  const file = await scenario.file(person, id);
  expect(file).toMatchObject({ status: 'available', rejection: null, sha256: sha256(content) });
  const other = await scenario.uploader();
  const tenantId = scenario.tenant.id;
  await scenario.inTenant(async (tx) => {
    await expect(
      attachablePdfForSignature(tx, { tenantId, userId: person.id }, id),
    ).resolves.toEqual({
      id,
      sha256: sha256(content),
    });
    await expect(
      attachablePdfForSignature(tx, { tenantId, userId: other.id }, id),
    ).resolves.toBeNull();
  });
}

describe('carga por enlace temporal y análisis', () => {
  it('un PDF queda disponible con su huella SHA-256', availablePdf);

  it('un archivo de ensayo con firma de virus es rechazado y borrado del almacenamiento', async () => {
    const person = await scenario.uploader();
    // Disfrazado de PDF: el antivirus lo revisa antes que el tipo.
    const { id, result } = await scenario.upload(person, { ...pdfFile(eicar()), name: 'acta.pdf' });
    expect(result).toBe('virus');
    expect(await scenario.file(person, id)).toMatchObject({
      status: 'rejected',
      rejection: 'virus',
    });
    const stored = await scenario.inTenant((tx) => tx.file.findUniqueOrThrow({ where: { id } }));
    await expect(storage().read(stored.storageKey)).rejects.toThrow();
    const alert = await scenario.inTenant((tx) =>
      tx.securityEvent.findFirst({ where: { type: 'doc.file.virus_detected', userId: person.id } }),
    );
    expect(alert?.severity).toBe('high');
    expect(errorCode(await scenario.post(`/v1/files/${id}/download-link`, person.session))).toBe(
      'FILE_NOT_AVAILABLE',
    );
  });

  it('un ejecutable renombrado como PDF es rechazado', async () => {
    const person = await scenario.uploader();
    const exe = Buffer.from('MZ\u0090\u0000 programa de Windows renombrado');
    const { result } = await scenario.upload(person, { ...pdfFile(exe), name: 'factura.pdf' });
    expect(result).toBe('type_mismatch');
  });
});

describe('enlace de subida', () => {
  it('el enlace de subida sirve una sola vez', async () => {
    const person = await scenario.uploader();
    const file = pdfFile();
    const link = await scenario.requestUpload(person, file);
    expect((await scenario.put(link.upload_url, file.content, file.type)).status).toBe(204);
    expect(errorCode(await scenario.put(link.upload_url, file.content, file.type))).toBe(
      'FILE_LINK_INVALID',
    );
  });

  it('rechaza un contenido con otro tipo u otro tamaño que el declarado, y deja reintentar', async () => {
    const person = await scenario.uploader();
    const file = pdfFile();
    const link = await scenario.requestUpload(person, file);
    expect(errorCode(await scenario.put(link.upload_url, file.content, 'image/png'))).toBe(
      'FILE_TYPE_NOT_ALLOWED',
    );
    const bigger = Buffer.concat([file.content, Buffer.from('extra')]);
    expect(errorCode(await scenario.put(link.upload_url, bigger, file.type))).toBe(
      'FILE_SIZE_MISMATCH',
    );
    expect((await scenario.put(link.upload_url, file.content, file.type)).status).toBe(204);
  });
});

describe('lista blanca y reintentos del análisis', () => {
  it('rechaza pedir la subida de un tipo fuera de la lista blanca', async () => {
    const person = await scenario.uploader();
    const response = await scenario.post('/v1/files', person.session, {
      file_name: 'macro.xlsm',
      mime_type: 'application/vnd.ms-excel.sheet.macroEnabled.12',
      size_bytes: 100,
    });
    expect(response.status).toBe(422);
  });

  it('un enlace de subida vencido no sirve', async () => {
    const person = await scenario.uploader();
    const file = pdfFile();
    const link = await scenario.requestUpload(person, file);
    scenario.clock.advance(16 * MINUTE);
    expect(errorCode(await scenario.put(link.upload_url, file.content, file.type))).toBe(
      'FILE_LINK_INVALID',
    );
  });

  it('el análisis espera a que termine la subida y repetirlo no cambia nada', async () => {
    const person = await scenario.uploader();
    const file = pdfFile();
    const link = await scenario.requestUpload(person, file);
    await expect(scenario.scan(link.id)).rejects.toBeInstanceOf(FileNotReadyError);
    await scenario.put(link.upload_url, file.content, file.type);
    expect(await scenario.scan(link.id)).toBe('available');
    expect(await scenario.scan(link.id)).toBe('skipped');
  });

  it('la base de datos no deja cambiar la huella de un archivo ya analizado', async () => {
    const person = await scenario.uploader();
    const { id } = await scenario.upload(person, pdfFile());
    await expect(
      scenario.inTenant((tx) =>
        tx.file.update({ where: { id }, data: { sha256: sha256(Buffer.from('otro')) } }),
      ),
    ).rejects.toThrow();
  });
});

describe('descarga por enlace de cinco minutos', () => {
  it('entrega el mismo contenido como adjunto', async () => {
    const person = await scenario.uploader();
    const content = samplePdf();
    const { id } = await scenario.upload(person, pdfFile(content));
    const link = await scenario.downloadLink(person, id);
    const response = await scenario.fetchLink(link.url);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(sha256(response.body as Buffer)).toBe(sha256(content));
  });

  it('el enlace vence a los cinco minutos', async () => {
    const person = await scenario.uploader();
    const { id } = await scenario.upload(person, pdfFile());
    const link = await scenario.downloadLink(person, id);
    expect(new Date(link.expires_at).getTime() - scenario.clock.now().getTime()).toBe(5 * MINUTE);
    scenario.clock.advance(4 * MINUTE);
    expect((await scenario.fetchLink(link.url)).status).toBe(200);
    scenario.clock.advance(MINUTE);
    const expired = await scenario.fetchLink(link.url);
    expect(expired.status).toBe(404);
  });

  it('un enlace inventado o de subida no descarga nada', async () => {
    const person = await scenario.uploader();
    const upload = await scenario.requestUpload(person, pdfFile());
    const asDownload = upload.upload_url.replace('/uploads/', '/downloads/');
    expect((await scenario.fetchLink(asDownload)).status).toBe(404);
    expect(
      (await scenario.fetchLink('http://localhost:4000/v1/files/downloads/inventado')).status,
    ).toBe(404);
  });
});
