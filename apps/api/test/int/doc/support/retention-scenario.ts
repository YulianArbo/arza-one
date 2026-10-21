import {
  createdResponseSchema,
  dispositionProposalDetailSchema,
  documentRetentionSchema,
  documentSearchResponseSchema,
  proposeDispositionsResponseSchema,
  retentionRuleListResponseSchema,
  type DispositionProposalDetail,
  type DocumentRetention,
  type DocumentSearchHit,
  type ProposeDispositionsResponse,
  type RetentionRuleListResponse,
} from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import {
  executeApprovedDispositions,
  extractPdfText,
  extractPendingTexts,
} from '../../../../src/modules/doc/index.js';
import { apiDatabase } from '../../support/integration-database.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { pdfFile, samplePdf, storage } from './file-scenario.js';
import { SgcScenario } from './sgc-scenario.js';

// Escenario de la retención, la disposición final y la búsqueda (B21): reglas por la API,
// documentos obsoletos con su fecha llevada al pasado (para que su retención venza), la propuesta
// y sus pasos, lo que hace el worker (ejecutar las aprobadas, extraer el texto) y la búsqueda.

const YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Un PDF de verdad, de una página, con el texto dado (en Latin-1, como lo escribe Helvetica). */
function textPdf(text: string): Buffer {
  const escaped = text.replace(/[\\()]/gu, (char) => `\\${char}`);
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${String(Buffer.byteLength(stream, 'latin1'))} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'latin1');
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`);
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${entries.join('')}`;
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

export class RetentionScenario extends SgcScenario {
  putJson(path: string, session: SignedIn, body: object, version?: number): request.Test {
    let call = request(this.app.getHttpServer())
      .put(path)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.session.csrf_token);
    if (version !== undefined) call = call.set('If-Match', `"${String(version)}"`);
    return call.send(body);
  }

  ruleBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      code: `R-${String(Math.floor(Math.random() * 1_000_000))}`,
      name: 'Procedimientos del SGC',
      doc_type: 'PR',
      process_id: null,
      active_years: 1,
      archive_years: 2,
      disposition: 'destroy',
      legal_basis: 'PR-SGC-001, numeral 6',
      ...overrides,
    };
  }

  async rule(person: Person, overrides: Record<string, unknown> = {}): Promise<string> {
    const response = await this.post(
      '/v1/retention-rules',
      person.session,
      this.ruleBody(overrides),
    );
    expect(response.status, response.text).toBe(201);
    return createdResponseSchema.parse(response.body).id;
  }

  async rules(person: Person): Promise<RetentionRuleListResponse> {
    const response = await this.get('/v1/retention-rules', person.session);
    expect(response.status, response.text).toBe(200);
    return retentionRuleListResponseSchema.parse(response.body);
  }

  async retentionOf(person: Person, documentId: string): Promise<DocumentRetention> {
    const response = await this.get(`/v1/documents/${documentId}/retention-rule`, person.session);
    expect(response.status, response.text).toBe(200);
    return documentRetentionSchema.parse(response.body);
  }

  /** Un procedimiento del SGC publicado y después declarado obsoleto. */
  async obsoleteDocument(
    author: Person,
    approver: Person,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const id = await this.createDocument(author, overrides);
    const current = await this.publishLatest(author, approver, id);
    const requestId = await this.approvedRequest(author, { action: 'obsolete', documentId: id });
    const body = { reason: 'El proceso ya no lo usa', change_request_id: requestId };
    const done = await this.step(approver, current, 'obsolete', body);
    expect(done.status, done.text).toBe(204);
    return id;
  }

  /** Lleva al pasado la publicación y la obsolescencia del documento. */
  async age(documentId: string, years: number, tenantId = this.tenant.id): Promise<void> {
    const shift = years * YEAR;
    await this.db.withTenant({ tenantId, userId: null }, async (tx) => {
      const versions = await tx.docVersion.findMany({ where: { documentId } });
      for (const version of versions) {
        await tx.docVersion.update({
          where: { id: version.id },
          data: {
            publishedAt:
              version.publishedAt === null ? null : new Date(version.publishedAt.getTime() - shift),
            obsoletedAt:
              version.obsoletedAt === null ? null : new Date(version.obsoletedAt.getTime() - shift),
          },
        });
      }
    });
  }

  /** Obsoleto hace diez años, con la regla de los procedimientos del SGC vencida. */
  async expiredDocument(author: Person, approver: Person): Promise<string> {
    const id = await this.obsoleteDocument(author, approver);
    await this.age(id, 10);
    return id;
  }

  async propose(person: Person): Promise<ProposeDispositionsResponse> {
    const response = await this.post('/v1/dispositions/propose', person.session);
    expect(response.status, response.text).toBe(200);
    return proposeDispositionsResponseSchema.parse(response.body);
  }

  async disposition(person: Person, id: string): Promise<DispositionProposalDetail> {
    const response = await this.get(`/v1/dispositions/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return dispositionProposalDetailSchema.parse(response.body);
  }

  async dispositionStep(
    person: Person,
    id: string,
    step: 'send' | 'approve' | 'reject',
    comment: string | null = null,
  ): Promise<request.Response> {
    const seen = await this.disposition(person, id);
    return this.post(`/v1/dispositions/${id}/actions/${step}`, person.session, { comment }).set(
      'If-Match',
      `"${String(seen.version)}"`,
    );
  }

  async keep(
    person: Person,
    proposalId: string,
    documentId: string,
    reason: string | null,
  ): Promise<request.Response> {
    const seen = await this.disposition(person, proposalId);
    const item = seen.items.find((row) => row.document.id === documentId);
    if (item === undefined) throw new Error('El documento no está en la propuesta.');
    const body = { action: reason === null ? 'destroy' : 'keep', keep_reason: reason };
    return this.putJson(
      `/v1/dispositions/${proposalId}/items/${item.id}`,
      person.session,
      body,
      item.version,
    );
  }

  /** Lo que hace el worker con «doc.disposition-execute», con un PDF de prueba como acta. */
  async execute(): Promise<number> {
    return executeApprovedDispositions({
      database: apiDatabase(),
      clock: this.clock,
      storage: storage(),
      convertHtml: async () => Promise.resolve(samplePdf('Acta de disposición')),
    });
  }

  /** Lo que hace el worker con «doc.text-extract», con la lectura real de los PDF. */
  async extractTexts(): Promise<number> {
    return extractPendingTexts({
      database: apiDatabase(),
      clock: this.clock,
      storage: storage(),
      extractText: extractPdfText,
    });
  }

  /** Un documento vigente cuyo PDF dice el texto dado. */
  async publishedWithText(
    author: Person,
    approver: Person,
    text: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const source = await this.sourceFile(author, pdfFile(textPdf(text)));
    const id = await this.createDocument(author, { source_file_id: source, ...overrides });
    await this.publishLatest(author, approver, id);
    return id;
  }

  async search(person: Person, q: string): Promise<DocumentSearchHit[]> {
    const response = await this.get(
      `/v1/documents/search?q=${encodeURIComponent(q)}`,
      person.session,
    );
    expect(response.status, response.text).toBe(200);
    return documentSearchResponseSchema.parse(response.body).data;
  }
}
