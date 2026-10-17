import {
  createdResponseSchema,
  documentSchema,
  folderListResponseSchema,
  versionListResponseSchema,
  type Document,
  type Folder,
  type Version,
} from '@arza/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { expect, inject } from 'vitest';

import { seedCore } from '../../../../src/modules/core/index.js';
import {
  renderVersionPdf,
  scanUploadedFile,
  scanWithClamav,
  seedDocFolders,
  seedDocWorkflows,
  type VersionRenderResult,
} from '../../../../src/modules/doc/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { apiDatabase } from '../../support/integration-database.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { FileScenario, pdfFile, samplePdf, storage, type SampleFile } from './file-scenario.js';

// Escenario de las pruebas de documentos y versiones (B18): la API completa con Garage y ClamAV
// reales, el núcleo y las carpetas iniciales sembrados, y la conversión a PDF con un convertidor
// de prueba (la conversión real con Gotenberg se prueba en el worker). Desde B19 siembra los flujos
// de la gestión documental; las versiones pasan por su trámite y un documento del SGC necesita una
// Solicitud de Acción Documental aprobada, que estas ayudas dejan lista en la base cuando la prueba
// no trata de la solicitud misma.

const WORD = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Un .docx mínimo: cabecera ZIP y el nombre de su parte principal, como lo reconoce el análisis. */
export function wordFile(): SampleFile {
  const zip = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from(`word/document.xml ${uuidv7()}`),
  ]);
  return { name: 'Procedimiento.docx', type: WORD, content: zip };
}

export type Step = 'submit' | 'reject' | 'approve' | 'publish' | 'obsolete';

/** Lo que pide una solicitud aprobada de prueba. */
export interface RequestFixture {
  readonly action: 'create' | 'update' | 'obsolete';
  readonly documentId?: string;
  readonly docType?: string;
  readonly processId?: string | null;
}

let requestNumber = Math.floor(Math.random() * 1_000_000);

export class DocScenario extends FileScenario {
  private seeded = false;
  /** Empresa de cada persona de otra empresa, para analizar sus archivos donde corresponde. */
  private readonly tenantOf = new Map<string, string>();

  /** Núcleo (procesos, tipos de documento) y carpetas iniciales de las dos empresas. */
  async seed(): Promise<void> {
    if (this.seeded) return;
    const tenants = [this.tenant.id, this.otherTenant.id];
    await seedCore(apiDatabase(), tenants, systemClock);
    await seedDocFolders(apiDatabase(), tenants, systemClock);
    await seedDocWorkflows(apiDatabase(), tenants, systemClock);
    this.seeded = true;
  }

  private directorPerson?: Promise<Person>;

  /** Dirección aprueba las versiones en el trámite (B19); una sola persona por escenario. */
  async director(): Promise<Person> {
    this.directorPerson ??= this.person('direccion', ['DIRECCION']);
    return this.directorPerson;
  }

  /** Una solicitud ya aprobada por otra persona, escrita en la base (B19). */
  async approvedRequest(requester: Person, fixture: RequestFixture): Promise<string> {
    requestNumber += 1;
    const creates = fixture.action === 'create';
    const tenantId = this.tenantOf.get(requester.id) ?? this.tenant.id;
    const request = await this.db.withTenant({ tenantId, userId: null }, (tx) =>
      tx.docChangeRequest.create({
        data: {
          tenantId,
          code: `SAD-2026-${String(requestNumber).padStart(7, '0')}`,
          action: fixture.action,
          documentId: fixture.documentId ?? null,
          docType: creates ? (fixture.docType ?? 'PR') : null,
          processId: creates ? (fixture.processId ?? null) : null,
          title: 'Solicitud de prueba',
          justification: 'Solicitud aprobada para la prueba.',
          status: 'approved',
          requestedBy: requester.id,
          decidedBy: uuidv7(),
          decidedAt: this.clock.now(),
        },
      }),
    );
    return request.id;
  }

  async quality(label = 'calidad', tenantId = this.tenant.id): Promise<Person> {
    const person = await this.person(label, ['CALIDAD'], { tenantId });
    this.tenantOf.set(person.id, tenantId);
    return person;
  }

  async folderId(code: string, tenantId = this.tenant.id): Promise<string> {
    await this.seed();
    const scope = { tenantId, userId: null };
    const folder = await this.db.withTenant(scope, (tx) =>
      tx.docFolder.findFirstOrThrow({ where: { code } }),
    );
    return folder.id;
  }

  async processId(code: string, tenantId = this.tenant.id): Promise<string> {
    await this.seed();
    const scope = { tenantId, userId: null };
    const unit = await this.db.withTenant(scope, (tx) =>
      tx.orgUnit.findFirstOrThrow({ where: { code } }),
    );
    return unit.id;
  }

  /** Un archivo disponible de la persona (subido y analizado de verdad). */
  async sourceFile(person: Person, file: SampleFile = pdfFile(samplePdf())): Promise<string> {
    const link = await this.requestUpload(person, file);
    const sent = await this.put(link.upload_url, file.content, file.type);
    expect(sent.status, sent.text).toBe(204);
    const tenantId = this.tenantOf.get(person.id) ?? this.tenant.id;
    const result = await scanUploadedFile(
      { tenantId, userId: null, correlationId: uuidv7(), fileId: link.id },
      {
        database: apiDatabase(),
        clock: this.clock,
        storage: storage(),
        antivirus: async (content) =>
          scanWithClamav({ ...inject('antivirus'), timeoutMs: 10_000 }, content),
      },
    );
    expect(result).toBe('available');
    return link.id;
  }

  async documentBody(
    person: Person,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      folder_id: await this.folderId('SGC-SGC'),
      doc_type: 'PR',
      is_controlled: true,
      process_id: await this.processId('SGC'),
      title: 'Control de documentos',
      classification: 'internal',
      owner_position_id: null,
      source_file_id: await this.sourceFile(person),
      change_summary: 'Creación del documento',
      ...overrides,
    };
    if (body['is_controlled'] !== true || 'change_request_id' in overrides) return body;
    const docType = typeof body['doc_type'] === 'string' ? body['doc_type'] : 'PR';
    const processId = typeof body['process_id'] === 'string' ? body['process_id'] : null;
    const fixture = { action: 'create', docType, processId } as const;
    return { ...body, change_request_id: await this.approvedRequest(person, fixture) };
  }

  /** Versión nueva en borrador del documento, con un PDF recién subido. */
  async newVersion(
    person: Person,
    documentId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const tenantId = this.tenantOf.get(person.id) ?? this.tenant.id;
    const document = await this.db.withTenant({ tenantId, userId: null }, (tx) =>
      tx.docDocument.findFirst({ where: { id: documentId } }),
    );
    const request =
      document?.isControlled === true && !('change_request_id' in overrides)
        ? {
            change_request_id: await this.approvedRequest(person, { action: 'update', documentId }),
          }
        : {};
    const response = await this.post(`/v1/documents/${documentId}/versions`, person.session, {
      ...request,
      title: 'Control de documentos',
      classification: 'internal',
      owner_position_id: null,
      source_file_id: await this.sourceFile(person),
      change_summary: 'Ajuste del alcance',
      ...overrides,
    });
    expect(response.status, response.text).toBe(201);
    return createdResponseSchema.parse(response.body).id;
  }

  async createDocument(person: Person, overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await this.post('/v1/documents', person.session, {
      ...(await this.documentBody(person, overrides)),
    });
    expect(response.status, response.text).toBe(201);
    return createdResponseSchema.parse(response.body).id;
  }

  async document(person: Person, id: string): Promise<Document> {
    const response = await this.get(`/v1/documents/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return documentSchema.parse(response.body);
  }

  async versions(person: Person, documentId: string): Promise<Version[]> {
    const response = await this.get(`/v1/documents/${documentId}/versions`, person.session);
    expect(response.status, response.text).toBe(200);
    return versionListResponseSchema.parse(response.body).data;
  }

  async latest(person: Person, documentId: string): Promise<Version> {
    const [latest] = await this.versions(person, documentId);
    if (latest === undefined) throw new Error('El documento no tiene versiones.');
    return latest;
  }

  /** Paso de una versión con la versión vista en If-Match. */
  step(person: Person, version: Version, step: Step, body: object = {}): request.Test {
    return this.post(`/v1/versions/${version.id}/actions/${step}`, person.session, body).set(
      'If-Match',
      `"${String(version.version)}"`,
    );
  }

  /**
   * Lleva la versión más nueva del documento hasta vigente por su trámite (B19): la envía quien la
   * elaboró, Calidad (approver) la revisa, Dirección la aprueba y Calidad la publica.
   */
  async publishLatest(author: Person, approver: Person, documentId: string): Promise<Version> {
    const sent = await this.step(author, await this.latest(author, documentId), 'submit');
    expect(sent.status, sent.text).toBe(204);
    const reviewed = await this.step(approver, await this.latest(approver, documentId), 'approve');
    expect(reviewed.status, reviewed.text).toBe(204);
    const director = await this.director();
    const approved = await this.step(director, await this.latest(director, documentId), 'approve');
    expect(approved.status, approved.text).toBe(204);
    const published = await this.step(approver, await this.latest(approver, documentId), 'publish');
    expect(published.status, published.text).toBe(204);
    return this.latest(approver, documentId);
  }

  async folders(person: Person): Promise<Folder[]> {
    const response = await this.get('/v1/folders', person.session);
    expect(response.status, response.text).toBe(200);
    return folderListResponseSchema.parse(response.body).data;
  }

  delete(path: string, session: SignedIn): request.Test {
    return request(this.app.getHttpServer())
      .delete(path)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.session.csrf_token);
  }

  /** Lo que hace el worker con «doc.version-render», con un convertidor de prueba. */
  async render(
    versionId: string,
    convert: () => Promise<Buffer> = () => Promise.resolve(samplePdf('Convertido')),
  ): Promise<VersionRenderResult> {
    return renderVersionPdf(
      { tenantId: this.tenant.id, userId: null, correlationId: uuidv7(), versionId },
      { database: apiDatabase(), clock: this.clock, storage: storage(), convert },
    );
  }

  /** Da al usuario un cargo del proceso indicado (para «lo propio» del Colaborador). */
  async placeInProcess(userId: string, processCode: string): Promise<void> {
    const processId = await this.processId(processCode);
    await this.inTenant(async (tx) => {
      const position = await tx.position.create({
        data: { tenantId: this.tenant.id, orgUnitId: processId, name: `Cargo ${uuidv7()}` },
      });
      await tx.user.update({ where: { id: userId }, data: { positionId: position.id } });
    });
  }
}
