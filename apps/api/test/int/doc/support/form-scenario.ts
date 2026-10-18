import {
  createdResponseSchema,
  formRecordSchema,
  formTemplateListResponseSchema,
  formTemplateSchema,
  type FormRecord,
  type FormTemplate,
} from '@arza/contracts';
import type request from 'supertest';
import { expect } from 'vitest';

import {
  renderTenantPdfs,
  seedDocForms,
  type PdfRenderDependencies,
  type PdfRenderResult,
} from '../../../../src/modules/doc/index.js';
import { systemClock } from '../../../../src/platform/clock/clock.js';
import { apiDatabase } from '../../support/integration-database.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { samplePdf, storage } from './file-scenario.js';
import { SgcScenario } from './sgc-scenario.js';

// Escenario de los formatos digitales (B20): los formatos piloto sembrados en las dos empresas,
// registros diligenciados por la API y la generación de los PDF con convertidores de prueba (la
// conversión real con Gotenberg se prueba en el worker).

export type RecordStep = 'submit' | 'approve' | 'reject';

/** Datos completos del FT-COM-002 (Acta de Revisión de Requisitos y Arranque). */
export const REQUIREMENTS_DATA = {
  cliente: 'Cliente Ficticio S.A.S.',
  oportunidad: 'Portal de autogestión',
  fecha: '2026-10-18',
  requisitos: [
    { requisito: 'Inicio de sesión con segundo factor', tipo: 'Técnico', capacidad: 'Sí' },
  ],
  decision: 'Viable',
};

/** Datos completos del FT-SGC-002 (Lista de Verificación Documental). */
export const CHECKLIST_DATA = {
  codigo: 'PR-SGC-001',
  nombre: 'Control de documentos',
  version: '00',
  puntos: Array.from({ length: 9 }, () => ({ result: 'yes', note: '' })),
  resultado: 'Conforme',
};

/** Datos completos del FT-TEC-001 (Acta de Entrega Técnica). */
export const DELIVERY_DATA = {
  cliente: 'Cliente Ficticio S.A.S.',
  proyecto: 'Portal',
  fecha: '2026-10-18',
  entregables: [{ entregable: 'Módulo de ingreso', version: '1.0', descripcion: 'Entrega' }],
  recibe_nombre: 'Persona Ficticia',
};

export class FormScenario extends SgcScenario {
  private formsSeeded = false;

  override async seed(): Promise<void> {
    await super.seed();
    if (this.formsSeeded) return;
    await seedDocForms(apiDatabase(), [this.tenant.id, this.otherTenant.id], systemClock);
    this.formsSeeded = true;
  }

  /** La versión publicada del formato con ese código. */
  async publishedTemplate(person: Person, code: string): Promise<FormTemplate> {
    await this.seed();
    const response = await this.get(
      `/v1/form-templates?code=${code}&status=published`,
      person.session,
    );
    expect(response.status, response.text).toBe(200);
    const [found] = formTemplateListResponseSchema.parse(response.body).data;
    if (found === undefined) throw new Error(`No hay versión publicada de ${code}.`);
    return this.template(person, found.id);
  }

  async template(person: Person, id: string): Promise<FormTemplate> {
    const response = await this.get(`/v1/form-templates/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return formTemplateSchema.parse(response.body);
  }

  /** Una versión nueva en borrador del formato, con los mismos campos o los dados, publicada. */
  async publishNewVersion(
    person: Person,
    current: FormTemplate,
    changes: object = {},
  ): Promise<string> {
    const body = {
      code: current.code,
      name: current.name,
      definition: current.definition,
      layout: current.layout,
      document_id: current.document?.id ?? null,
      output_template_id: current.output_template?.id ?? null,
      workflow_key: current.workflow_key,
      classification: current.classification,
      entity_type: current.entity_type,
      ...changes,
    };
    const created = await this.post('/v1/form-templates', person.session, body);
    expect(created.status, created.text).toBe(201);
    const { id } = createdResponseSchema.parse(created.body);
    const published = await this.post(
      `/v1/form-templates/${id}/actions/publish`,
      person.session,
    ).set('If-Match', '"1"');
    expect(published.status, published.text).toBe(204);
    return id;
  }

  /** Diligencia el formato publicado con ese código y devuelve el registro en borrador. */
  async fill(
    person: Person,
    code: string,
    data: object,
    entity: { readonly type: string; readonly id: string } | null = null,
  ): Promise<string> {
    const template = await this.publishedTemplate(person, code);
    const response = await this.post('/v1/form-records', person.session, {
      template_id: template.id,
      data,
      entity_type: entity?.type ?? null,
      entity_id: entity?.id ?? null,
    });
    expect(response.status, response.text).toBe(201);
    return createdResponseSchema.parse(response.body).id;
  }

  async record(person: Person, id: string): Promise<FormRecord> {
    const response = await this.get(`/v1/form-records/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return formRecordSchema.parse(response.body);
  }

  /** Un formato propio de la prueba, con los campos del FT-COM-002 y sin aprobación (versión 1). */
  async formOfItsOwn(designer: Person): Promise<FormTemplate> {
    const code = `FT-PRB-${String(Date.now()).slice(-6)}`;
    const base = await this.publishedTemplate(designer, 'FT-COM-002');
    await this.publishNewVersion(designer, base, { code, workflow_key: null });
    return this.publishedTemplate(designer, code);
  }

  /** Guarda el borrador con la versión vista. */
  async saveDraft(person: Person, id: string, data: object): Promise<request.Response> {
    const seen = await this.record(person, id);
    return this.patch(`/v1/form-records/${id}`, person.session, { data }, seen.version);
  }

  /** El trámite de aprobación del registro, para atenderlo desde «Mis tareas». */
  async instanceOf(recordId: string): Promise<string> {
    const record = await this.inTenant((tx) =>
      tx.docFormRecord.findUniqueOrThrow({ where: { id: recordId } }),
    );
    return record.workflowInstanceId ?? '';
  }

  /** Una versión de un documento nuevo, ya enviada a revisión por quien la elaboró. */
  async versionInReview(author: Person): Promise<{ documentId: string; versionId: string }> {
    const documentId = await this.createDocument(author);
    const latest = await this.latest(author, documentId);
    expect((await this.step(author, latest, 'submit')).status).toBe(204);
    return { documentId, versionId: latest.id };
  }

  /** Una lista de verificación enviada (terminada) de una versión nueva en revisión. */
  async completedChecklist(reviewer: Person): Promise<string> {
    const { versionId } = await this.versionInReview(await this.quality('elabora'));
    const entity = { type: 'doc_version', id: versionId };
    const id = await this.fill(reviewer, 'FT-SGC-002', CHECKLIST_DATA, entity);
    expect((await this.recordStep(reviewer, id, 'submit')).status).toBe(204);
    return id;
  }

  /** Revisa (aprueba la revisión de) la versión más nueva del documento. */
  async review(reviewer: Person, documentId: string): Promise<request.Response> {
    return this.step(reviewer, await this.latest(reviewer, documentId), 'approve');
  }

  /** Crea una plantilla de salida en borrador y la publica si se pide. */
  async outputTemplate(person: Person, body: object, publish = false): Promise<string> {
    const response = await this.post('/v1/output-templates', person.session, body);
    expect(response.status, response.text).toBe(201);
    const { id } = createdResponseSchema.parse(response.body);
    if (publish) {
      const published = await this.post(
        `/v1/output-templates/${id}/actions/publish`,
        person.session,
      ).set('If-Match', '"1"');
      expect(published.status, published.text).toBe(204);
    }
    return id;
  }

  /** Paso del registro con la versión vista en If-Match. */
  async recordStep(
    person: Person,
    id: string,
    step: RecordStep,
    comment: string | null = null,
  ): Promise<request.Response> {
    const seen = await this.record(person, id);
    return this.post(`/v1/form-records/${id}/actions/${step}`, person.session, { comment }).set(
      'If-Match',
      `"${String(seen.version)}"`,
    );
  }

  /**
   * Lo que hace el worker con «doc.pdf-render» en la empresa del escenario (las demás pruebas
   * tienen sus propias empresas), con convertidores de prueba.
   */
  async renderPdfs(
    overrides: Partial<PdfRenderDependencies> = {},
    tenantId = this.tenant.id,
  ): Promise<PdfRenderResult> {
    const deps: PdfRenderDependencies = {
      database: apiDatabase(),
      clock: this.clock,
      storage: storage(),
      convertHtml: () => Promise.resolve(samplePdf('Formato')),
      convertOffice: () => Promise.resolve(samplePdf('Formato Word')),
      stamp: (pdf) => Promise.resolve(Buffer.concat([pdf, Buffer.from('\n% sello')])),
      ...overrides,
    };
    return renderTenantPdfs(deps, tenantId);
  }
}
