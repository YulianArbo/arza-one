import { beforeAll, describe, expect, it } from 'vitest';

import { ConversionRejectedError } from '../../../src/modules/doc/infrastructure/gotenberg-converter.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { CHECKLIST_DATA, FormScenario } from './support/form-scenario.js';

// Formatos conectados con el control documental (B20): la Lista de Verificación Documental
// (FT-SGC-002) al revisar una versión, el FT-SGC-001 de cada solicitud decidida y la copia de
// consulta de la versión vigente, con el pie de copia no controlada.

const scenario = new FormScenario('formatos y control documental');

beforeAll(async () => {
  await scenario.seed();
});

describe('FT-SGC-002 al revisar una versión', () => {
  it('Calidad no aprueba la revisión sin la lista de verificación de esa versión', async () => {
    const { documentId, versionId } = await scenario.versionInReview(
      await scenario.quality('elabora'),
    );
    const reviewer = await scenario.quality('revisa');
    expect(errorCode(await scenario.review(reviewer, documentId))).toBe('DOC_CHECKLIST_REQUIRED');
    const entity = { type: 'doc_version', id: versionId };
    const recordId = await scenario.fill(reviewer, 'FT-SGC-002', CHECKLIST_DATA, entity);
    expect((await scenario.record(reviewer, recordId)).entity?.label).toMatch(/versión 00$/u);
    expect(errorCode(await scenario.review(reviewer, documentId))).toBe('DOC_CHECKLIST_REQUIRED');
    expect((await scenario.recordStep(reviewer, recordId, 'submit')).status).toBe(204);
    const after = await scenario.review(reviewer, documentId);
    expect(after.status, after.text).toBe(204);
  });

  it('la lista se une a una versión en revisión, no a una suelta ni a un borrador', async () => {
    const author = await scenario.quality('borrador-version');
    const draft = await scenario.latest(author, await scenario.createDocument(author));
    const template = await scenario.publishedTemplate(author, 'FT-SGC-002');
    const base = { template_id: template.id, data: {} };
    const loose = await scenario.post('/v1/form-records', author.session, base);
    expect(errorCode(loose)).toBe('DOC_FORM_DATA_INVALID');
    const onDraft = await scenario.post('/v1/form-records', author.session, {
      ...base,
      entity_type: 'doc_version',
      entity_id: draft.id,
    });
    expect(errorCode(onDraft)).toBe('DOC_FORM_DATA_INVALID');
  });
});

describe('FT-SGC-001 de cada solicitud decidida', () => {
  it('al aprobarse la solicitud queda su registro FT-SGC-001 terminado, con su PDF', async () => {
    const requester = await scenario.quality('pide');
    const requestId = await scenario.approvedByFlow(requester);
    const request = await scenario.changeRequest(requester, requestId);
    const record = await scenario.record(requester, request.form_record_id ?? '');
    expect(record).toMatchObject({ status: 'completed', pdf_status: 'pending' });
    expect(record.template.code).toBe('FT-SGC-001');
    expect(record.entity).toMatchObject({ type: 'doc_change_request', id: requestId });
    expect(record.data).toMatchObject({
      codigo: request.code,
      accion: 'Creación',
      decision: 'Aprobada',
    });
    await scenario.renderPdfs();
    expect((await scenario.record(requester, record.id)).pdf_status).toBe('ready');
  });

  it('nadie lo diligencia a mano', async () => {
    const person = await scenario.quality('a-mano');
    const template = await scenario.publishedTemplate(person, 'FT-SGC-001');
    expect(template.fill_mode).toBe('system');
    expect(template.actions).not.toContain('fill');
    const response = await scenario.post('/v1/form-records', person.session, {
      template_id: template.id,
    });
    expect(errorCode(response)).toBe('DOC_FORM_TEMPLATE_NOT_FOUND');
  });
});

/** Lleva la versión en revisión hasta vigente, con su lista de verificación. */
async function publishWithChecklist(author: Person, documentId: string, versionId: string) {
  const reviewer = await scenario.quality('revisa-copia');
  const entity = { type: 'doc_version', id: versionId };
  const checklist = await scenario.fill(reviewer, 'FT-SGC-002', CHECKLIST_DATA, entity);
  await scenario.recordStep(reviewer, checklist, 'submit');
  await scenario.review(reviewer, documentId);
  const director = await scenario.director();
  await scenario.step(director, await scenario.latest(director, documentId), 'approve');
  await scenario.step(reviewer, await scenario.latest(reviewer, documentId), 'publish');
  expect((await scenario.latest(author, documentId)).status).toBe('current');
}

describe('copia de consulta de la versión vigente', () => {
  it('al publicarse, la descarga entrega la copia con el pie de copia no controlada', async () => {
    const author = await scenario.quality('copia');
    const { documentId, versionId } = await scenario.versionInReview(author);
    await publishWithChecklist(author, documentId, versionId);
    const stamps: string[] = [];
    const stamp = (pdf: Buffer, text: string) => {
      stamps.push(text);
      return Promise.resolve(Buffer.concat([pdf, Buffer.from('\n% sello')]));
    };
    expect((await scenario.renderPdfs({ stamp })).copies).toBeGreaterThanOrEqual(1);
    expect(
      stamps.some((text) =>
        /· Versión 00 · Vigente desde \d{2}\/\d{2}\/\d{4} · Copia no controlada cuando se imprime$/u.test(
          text,
        ),
      ),
    ).toBe(true);
    const version = await scenario.inTenant((tx) =>
      tx.docVersion.findUniqueOrThrow({ where: { id: versionId } }),
    );
    expect(version.copyFileId).not.toBeNull();
    expect(version.copyFileId).not.toBe(version.pdfFileId);
    const link = await scenario.post(`/v1/versions/${versionId}/download-link`, author.session, {
      file: 'pdf',
    });
    expect(link.status, link.text).toBe(200);
    const downloaded = await scenario.fetchLink((link.body as { url: string }).url);
    expect(String(downloaded.body)).toContain('% sello');
  });
});

describe('FT-SGC-001 de una solicitud rechazada', () => {
  it('lleva el documento que pedía cambiar, la decisión y su motivo', async () => {
    const requester = await scenario.quality('pide-cambio');
    const { documentId, versionId } = await scenario.versionInReview(requester);
    await publishWithChecklist(requester, documentId, versionId);
    const document = await scenario.document(requester, documentId);
    const update = { action: 'update', document_id: documentId, doc_type: null, process_id: null };
    const id = await scenario.fileRequest(requester, { ...update, title: null });
    const decider = await scenario.quality('rechaza');
    expect((await scenario.requestStep(decider, id, 'analyze')).status).toBe(204);
    const motive = 'El cambio no corresponde al alcance del proceso.';
    expect((await scenario.requestStep(decider, id, 'reject', motive)).status).toBe(204);
    const request = await scenario.changeRequest(decider, id);
    const record = await scenario.record(decider, request.form_record_id ?? '');
    expect(record.data).toMatchObject({
      accion: 'Modificación',
      documento: `${document.code} · ${document.title}`,
      tipo: '',
      proceso: '',
      decision: 'Rechazada',
      nota: motive,
    });
  });
});

describe('copia de consulta de un PDF protegido', () => {
  it('si el PDF no admite el sello, la copia es el mismo PDF y la auditoría lo dice', async () => {
    const author = await scenario.quality('copia-protegida');
    const { documentId, versionId } = await scenario.versionInReview(author);
    await publishWithChecklist(author, documentId, versionId);
    const stamp = () => Promise.reject(new ConversionRejectedError(400));
    expect((await scenario.renderPdfs({ stamp })).copies).toBeGreaterThanOrEqual(1);
    const event = await scenario.inTenant((tx) =>
      tx.auditEvent.findFirstOrThrow({
        where: { action: 'doc.version.copy', entityId: versionId },
      }),
    );
    expect(event.changes).toMatchObject({ stamped: false });
    const version = await scenario.inTenant((tx) =>
      tx.docVersion.findUniqueOrThrow({ where: { id: versionId } }),
    );
    expect(version.copyFileId).not.toBeNull();
  });
});
