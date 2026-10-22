import { createHash } from 'node:crypto';

import { dispositionProposalDetailSchema, documentRetentionSchema } from '@arza/contracts';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { expect } from 'vitest';

import { proposeForTenant } from '../../../../src/modules/doc/application/disposition-proposals.js';
import { executeApprovedDispositions } from '../../../../src/modules/doc/index.js';
import type { TenantTransaction } from '../../../../src/platform/database/tenant-context.js';
import { apiDatabase } from '../../support/integration-database.js';
import { WEB_ORIGIN, freshIp, type SignedIn } from '../../iam/support/iam-fixtures.js';
import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';
import { samplePdf, storage } from '../../doc/support/file-scenario.js';
import { code, created, quality, seeded, versionAt } from './doc-sgc-steps.js';

// Llamadas del recorrido de escrituras (B11) para la retención y la disposición final (B21): la
// tabla de retención, la excepción de un documento, la propuesta del mes y sus pasos, y el acta.
// Cada propuesta del recorrido es de un mes futuro distinto, con su propio documento vencido; solo
// la de «Generar la propuesta del mes» es del mes en curso.

interface PendingRequest {
  readonly test: request.Test;
}

type RouteCall = (scenario: AccessScenario) => Promise<PendingRequest>;

const YEAR = 365.25 * 24 * 60 * 60 * 1000;
const MONTH = 31 * 24 * 60 * 60 * 1000;
let monthsAhead = 1;

function put(s: AccessScenario, path: string, session: SignedIn, body: object, version: number) {
  return request(s.app.getHttpServer())
    .put(path)
    .set('Origin', WEB_ORIGIN)
    .set('X-Forwarded-For', freshIp())
    .set('Cookie', session.cookie)
    .set('X-CSRF-Token', session.session.csrf_token)
    .set('If-Match', `"${String(version)}"`)
    .send(body);
}

function ruleBody(docType: string) {
  return {
    code: `REC-${String(Math.floor(Math.random() * 1_000_000))}`,
    name: 'Serie del recorrido',
    doc_type: docType,
    process_id: null,
    active_years: 1,
    archive_years: 1,
    disposition: 'destroy',
    legal_basis: 'Recorrido de auditoría',
  };
}

/** La regla de los procedimientos que se eliminan, escrita en la base una sola vez. */
async function procedureRule(s: AccessScenario): Promise<void> {
  await s.inTenant(async (tx) => {
    const found = await tx.docRetentionRule.count({ where: { docType: 'PR', isActive: true } });
    if (found > 0) return;
    const body = ruleBody('PR');
    await tx.docRetentionRule.create({
      data: {
        tenantId: s.tenant.id,
        code: body.code,
        name: body.name,
        docType: 'PR',
        activeYears: 1,
        archiveYears: 1,
        disposition: 'destroy',
        legalBasis: body.legal_basis,
      },
    });
  });
}

/** El PDF de la carga inicial, disponible (analizado) desde la fecha dada. */
async function importedFile(tx: TenantTransaction, tenantId: string, past: Date): Promise<string> {
  const content = samplePdf('Procedimiento vencido');
  const file = await tx.file.create({
    data: {
      tenantId,
      storageKey: `${tenantId}/${uuidv7()}`,
      fileName: 'vencido.pdf',
      mimeType: 'application/pdf',
      sizeBytes: content.length,
      sha256: createHash('sha256').update(content).digest('hex'),
      scanStatus: 'available',
      scannedAt: past,
    },
  });
  return file.id;
}

/** La versión 00 de la carga inicial, publicada y declarada obsoleta en la fecha dada. */
async function obsoleteImport(
  tx: TenantTransaction,
  input: { tenantId: string; documentId: string; fileId: string; past: Date },
): Promise<string> {
  const { past } = input;
  const version = await tx.docVersion.create({
    data: {
      tenantId: input.tenantId,
      documentId: input.documentId,
      number: 0,
      versionLabel: '00',
      status: 'obsolete',
      origin: 'import',
      sourceFileId: input.fileId,
      pdfFileId: input.fileId,
      renderStatus: 'ready',
      title: 'Procedimiento vencido',
      classification: 'internal',
      changeSummary: 'Carga inicial',
      submittedAt: past,
      approvedAt: past,
      effectiveDate: past,
      publishedAt: past,
      obsoletedAt: past,
    },
  });
  return version.id;
}

/**
 * Un procedimiento de la carga inicial (B19) obsoleto hace diez años: su retención venció de
 * verdad. Se escribe en la base para no depender del trámite de la versión, que el recorrido ya
 * prueba en sus propias rutas.
 */
async function expiredDocument(s: AccessScenario): Promise<void> {
  await procedureRule(s);
  const folderId = await code(s, 'docFolder', 'SGC-SGC');
  const processId = await code(s, 'orgUnit', 'SGC');
  const past = new Date(Date.now() - 10 * YEAR);
  await s.inTenant(async (tx) => {
    const fileId = await importedFile(tx, s.tenant.id, past);
    const document = await tx.docDocument.create({
      data: {
        tenantId: s.tenant.id,
        folderId,
        code: `PR-SGC-${String(900_000 + Math.floor(Math.random() * 99_999))}`,
        title: 'Procedimiento vencido',
        docType: 'PR',
        processId,
        classification: 'internal',
        isControlled: true,
      },
    });
    const versionId = await obsoleteImport(tx, {
      tenantId: s.tenant.id,
      documentId: document.id,
      fileId,
      past,
    });
    await tx.docDocument.update({
      where: { id: document.id },
      data: { status: 'obsolete', currentVersionId: versionId },
    });
  });
}

interface ProposalAt {
  readonly id: string;
  readonly calidad: Person;
  readonly director: Person;
}

/** La propuesta de un mes futuro, en revisión de Calidad. */
async function proposalInReview(s: AccessScenario): Promise<ProposalAt> {
  await seeded(s);
  const calidad = await quality(s, 'calidad-disposicion-recorrido');
  const director = await s.person('direccion-disposicion-recorrido', ['DIRECCION']);
  await expiredDocument(s);
  monthsAhead += 1;
  const at = new Date(Date.now() + monthsAhead * MONTH);
  const actor = { tenantId: s.tenant.id, userId: null, meta: null, at };
  const outcome = await s.inTenant((tx) => proposeForTenant(tx, actor));
  expect(outcome.created).toBe(true);
  return { id: outcome.proposalId ?? '', calidad, director };
}

async function proposalVersion(s: AccessScenario, person: Person, id: string) {
  const response = await s.get(`/v1/dispositions/${id}`, person.session);
  expect(response.status, response.text).toBe(200);
  return dispositionProposalDetailSchema.parse(response.body);
}

function proposalStep(
  s: AccessScenario,
  person: Person,
  id: string,
  action: string,
  version: number,
) {
  const comment = action === 'reject' ? 'Falta revisar la serie.' : null;
  return s
    .post(`/v1/dispositions/${id}/actions/${action}`, person.session, { comment })
    .set('If-Match', `"${String(version)}"`);
}

async function sentProposal(s: AccessScenario): Promise<ProposalAt> {
  const proposal = await proposalInReview(s);
  const seen = await proposalVersion(s, proposal.calidad, proposal.id);
  const sent = await proposalStep(s, proposal.calidad, proposal.id, 'send', seen.version);
  expect(sent.status, sent.text).toBe(204);
  return proposal;
}

export const DOC_RETENTION_ROUTE_CALLS: Record<string, RouteCall> = {
  'POST /v1/retention-rules': async (s) => {
    await seeded(s);
    const person = await quality(s);
    return { test: s.post('/v1/retention-rules', person.session, ruleBody('IN')) };
  },
  'PUT /v1/retention-rules/{id}': async (s) => {
    await seeded(s);
    const person = await quality(s);
    const body = ruleBody('MP');
    const id = await created(s.post('/v1/retention-rules', person.session, body));
    const edit = { ...body, code: undefined, name: 'Serie editada', is_active: true };
    return { test: put(s, `/v1/retention-rules/${id}`, person.session, edit, 1) };
  },
  'PUT /v1/documents/{id}/retention-rule': async (s) => {
    const { approver, id } = await versionAt(s, []);
    const rule = await created(s.post('/v1/retention-rules', approver.session, ruleBody('DC')));
    const seen = await s.get(`/v1/documents/${id}/retention-rule`, approver.session);
    const { version } = documentRetentionSchema.parse(seen.body);
    const body = { retention_rule_id: rule };
    return { test: put(s, `/v1/documents/${id}/retention-rule`, approver.session, body, version) };
  },
  'POST /v1/dispositions/propose': async (s) => {
    await seeded(s);
    await expiredDocument(s);
    const person = await quality(s);
    return { test: s.post('/v1/dispositions/propose', person.session) };
  },
  'PUT /v1/dispositions/{id}/items/{itemId}': async (s) => {
    const { id, calidad } = await proposalInReview(s);
    const [item] = (await proposalVersion(s, calidad, id)).items;
    const body = { action: 'keep', keep_reason: 'Valor histórico' };
    const path = `/v1/dispositions/${id}/items/${item?.id ?? ''}`;
    return { test: put(s, path, calidad.session, body, item?.version ?? 0) };
  },
  'POST /v1/dispositions/{id}/actions/send': async (s) => {
    const { id, calidad } = await proposalInReview(s);
    const seen = await proposalVersion(s, calidad, id);
    return { test: proposalStep(s, calidad, id, 'send', seen.version) };
  },
  'POST /v1/dispositions/{id}/actions/{decision}': async (s) => {
    const { id, director } = await sentProposal(s);
    const seen = await proposalVersion(s, director, id);
    return { test: proposalStep(s, director, id, 'reject', seen.version) };
  },
  'POST /v1/dispositions/{id}/certificate': async (s) => {
    const { id, director } = await sentProposal(s);
    const seen = await proposalVersion(s, director, id);
    const approved = await proposalStep(s, director, id, 'approve', seen.version);
    expect(approved.status, approved.text).toBe(204);
    await executeApprovedDispositions({
      database: apiDatabase(),
      clock: { now: () => new Date() },
      storage: storage(),
      convertHtml: async () => Promise.resolve(samplePdf('Acta del recorrido')),
    });
    return { test: s.post(`/v1/dispositions/${id}/certificate`, director.session) };
  },
};
