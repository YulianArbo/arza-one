import { dispositionListResponseSchema, downloadLinkResponseSchema } from '@arza/contracts';
import { Readable } from 'node:stream';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  proposeMonthlyDispositions,
  renderTenantPdfs,
  seedRetentionDemo,
} from '../../../src/modules/doc/index.js';
import type { HtmlDocument } from '../../../src/modules/doc/infrastructure/gotenberg-converter.js';
import { apiDatabase } from '../support/integration-database.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { pdfFile, samplePdf, storage } from './support/file-scenario.js';
import { RetentionScenario, textPdf } from './support/retention-scenario.js';

// Casos de la disposición final y de la búsqueda (B21): una propuesta en la que todo se conserva,
// el acta con la versión vigente del RE-SGC-005, un acta alterada, un PDF sin texto, la lista por
// estado y por páginas, el trabajo diario, los datos de demostración y un contrato eliminado.

const scenario = new RetentionScenario('disposición casos');
const demo = new RetentionScenario('disposición demostración');
const listScenario = new RetentionScenario('disposición lista');
const caseFile = new RetentionScenario('disposición expediente');
let quality: Person;
let approver: Person;
let director: Person;
let proposalId: string;

/** Una propuesta con un documento que Calidad decide conservar, enviada y aprobada. */
async function keptAndApproved(): Promise<string> {
  const id = (await scenario.propose(quality)).proposal_id ?? '';
  const [item] = (await scenario.disposition(quality, id)).items;
  await scenario.keep(quality, id, item?.document.id ?? '', 'Valor histórico');
  expect((await scenario.dispositionStep(quality, id, 'send')).status).toBe(204);
  expect((await scenario.dispositionStep(director, id, 'approve')).status).toBe(204);
  return id;
}

beforeAll(async () => {
  await scenario.seed();
  quality = await scenario.quality('calidad-casos');
  approver = await scenario.quality('aprueba-casos');
  director = await scenario.director();
  await scenario.rule(quality, { doc_type: 'PR' });
  await scenario.importedDocument(quality, 'RE-SGC-005', '03');
  await scenario.expiredDocument(quality, approver);
  proposalId = await keptAndApproved();
});

describe('una propuesta en la que todo se conserva', () => {
  it('se ejecuta sin eliminar nada y el acta lleva la versión vigente del RE-SGC-005', async () => {
    const certificates: HtmlDocument[] = [];
    await scenario.execute(certificates);
    const done = await scenario.disposition(director, proposalId);
    expect(done).toMatchObject({ status: 'executed', to_destroy: 0, to_keep: 1 });
    expect(done.items[0]?.document.status).toBe('obsolete');
    const own = certificates.find((document) => document.footer.includes(done.code));
    expect(own?.header).toContain('Código: RE-SGC-005');
    expect(own?.header).toContain('Versión: 03');
    expect(own?.index).toContain('Ningún documento se eliminó.');
  });
});

describe('un acta alterada', () => {
  it('no se entrega y deja la alerta de seguridad', async () => {
    const proposal = await scenario.inTenant((tx) =>
      tx.docDispositionProposal.findUniqueOrThrow({
        where: { id: proposalId },
        include: { certificateFile: true },
      }),
    );
    const key = proposal.certificateFile?.storageKey ?? '';
    const ok = await scenario.post(`/v1/dispositions/${proposalId}/certificate`, director.session);
    expect(downloadLinkResponseSchema.safeParse(ok.body).success).toBe(true);
    const altered = Buffer.from('%PDF-1.7\n% acta alterada\n%%EOF\n');
    await storage().put(
      { key, contentType: 'application/pdf', sizeBytes: altered.length },
      Readable.from(altered),
    );
    const response = await scenario.post(
      `/v1/dispositions/${proposalId}/certificate`,
      director.session,
    );
    expect(errorCode(response)).toBe('DOC_INTEGRITY_FAILED');
    const alerts = await scenario.inTenant((tx) =>
      tx.securityEvent.findMany({ where: { type: 'doc.file.integrity_failed' } }),
    );
    expect(alerts.length).toBeGreaterThan(0);
  });
});

describe('un PDF sin texto', () => {
  it('queda vacío para la búsqueda, sin reintentarse', async () => {
    const source = await scenario.sourceFile(quality, pdfFile(textPdf('')));
    const id = await scenario.createDocument(quality, { source_file_id: source });
    await scenario.publishLatest(quality, approver, id);
    await scenario.extractTexts();
    const text = await scenario.inTenant((tx) =>
      tx.docVersionText.findFirstOrThrow({ where: { documentId: id } }),
    );
    expect(text).toMatchObject({ status: 'empty', content: '' });
  });
});

describe('la lista de propuestas', () => {
  it('filtra por estado y va por páginas', async () => {
    const list = listScenario;
    await list.seed();
    const calidad = await list.quality('calidad-lista');
    await list.rule(calidad, { doc_type: 'PR' });
    await list.expiredDocument(calidad, await list.quality('aprueba-lista'));
    const rejected = (await list.propose(calidad)).proposal_id ?? '';
    await list.dispositionStep(calidad, rejected, 'send');
    await list.dispositionStep(await list.director(), rejected, 'reject', 'Falta revisar');
    list.clock.advance(32 * 24 * 60 * 60 * 1000);
    const later = await list.refresh(calidad);
    const next = (await list.propose(later)).proposal_id ?? '';
    const ids = async (query: string) => {
      const response = await list.get(`/v1/dispositions?${query}`, later.session);
      return dispositionListResponseSchema.parse(response.body);
    };
    const first = await ids('limit=1');
    expect(first.data.map((p) => p.id)).toEqual([next]);
    const second = await ids(`limit=1&cursor=${first.next_cursor ?? ''}`);
    expect(second.data.map((p) => p.id)).toEqual([rejected]);
    expect((await ids('status=rejected')).data.map((p) => p.id)).toEqual([rejected]);
  });
});

describe('el trabajo diario y los datos de demostración', () => {
  it('la semilla deja una regla y dos contratos vencidos, una sola vez; el trabajo los propone', async () => {
    await demo.seed();
    await seedRetentionDemo(apiDatabase(), [demo.tenant.id], demo.clock);
    await seedRetentionDemo(apiDatabase(), [demo.tenant.id], demo.clock);
    const rules = await demo.inTenant((tx) => tx.docRetentionRule.findMany());
    expect(rules.map((rule) => rule.code)).toEqual(['DEMO-CT']);
    const deps = { database: apiDatabase(), clock: demo.clock };
    expect(await proposeMonthlyDispositions(deps)).toBeGreaterThanOrEqual(1);
    await proposeMonthlyDispositions(deps);
    const proposals = await demo.inTenant((tx) =>
      tx.docDispositionProposal.findMany({ include: { items: { include: { document: true } } } }),
    );
    expect(proposals).toHaveLength(1);
    const codes = proposals[0]?.items.map((item) => item.document.code).sort();
    expect(codes).toEqual(['DOC-2015-0001', 'DOC-2015-0002']);
  });
});

/** Un contrato de expediente publicado hace diez años, con la regla de contratos vencida. */
async function expiredContract(author: Person, approver: Person): Promise<string> {
  await caseFile.rule(author, { doc_type: 'CT', name: 'Contratos' });
  const id = await caseFile.createDocument(author, {
    folder_id: await caseFile.folderId('EXP'),
    doc_type: 'CT',
    is_controlled: false,
    process_id: null,
  });
  await caseFile.publishLatest(author, approver, id);
  await caseFile.age(id, 10);
  return id;
}

describe('un contrato de expediente eliminado', () => {
  it('se elimina vigente y ya no queda pendiente de su copia de consulta', async () => {
    await caseFile.seed();
    const author = await caseFile.quality('calidad-expediente');
    const id = await expiredContract(author, await caseFile.quality('aprueba-expediente'));
    const proposal = (await caseFile.propose(author)).proposal_id ?? '';
    await caseFile.dispositionStep(author, proposal, 'send');
    await caseFile.dispositionStep(await caseFile.director(), proposal, 'approve');
    await caseFile.execute();
    expect((await caseFile.document(author, id)).status).toBe('disposed');
    const pdf = async () => Promise.resolve(samplePdf('Copia'));
    const deps = {
      database: apiDatabase(),
      clock: caseFile.clock,
      storage: storage(),
      convertHtml: pdf,
      convertOffice: pdf,
      stamp: pdf,
    };
    const result = await renderTenantPdfs(deps, caseFile.tenant.id);
    expect(result).toMatchObject({ copies: 0, failed: 0 });
  });
});
