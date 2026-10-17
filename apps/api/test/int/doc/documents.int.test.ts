import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import { DocScenario } from './support/doc-scenario.js';

// Documentos y versiones (B18, ficha 17.4): código de PR-SGC-001 sin saltos, ciclo de la versión,
// una sola vigente por documento y nada cambia en lo vigente.

const scenario = new DocScenario('documentos');

beforeAll(async () => {
  await scenario.seed();
});

describe('código del documento (PR-SGC-001)', () => {
  it('TIPO-PROCESO-NNN sin saltos, un consecutivo por tipo y proceso', async () => {
    const author = await scenario.quality();
    const first = await scenario.document(author, await scenario.createDocument(author));
    const second = await scenario.document(author, await scenario.createDocument(author));
    const plan = await scenario.createDocument(author, { doc_type: 'PL' });
    const number = Number(first.code.slice(-3));
    expect(first.code).toMatch(/^PR-SGC-\d{3}$/u);
    expect(second.code).toBe(`PR-SGC-${String(number + 1).padStart(3, '0')}`);
    expect((await scenario.document(author, plan)).code).toMatch(/^PL-SGC-\d{3}$/u);
  });

  it('un documento de expediente toma DOC-AAAA-NNNN', async () => {
    const author = await scenario.quality();
    const id = await scenario.createDocument(author, {
      folder_id: await scenario.folderId('EXP'),
      is_controlled: false,
      process_id: null,
    });
    expect((await scenario.document(author, id)).code).toMatch(/^DOC-\d{4}-\d{4}$/u);
  });

  it('un tipo que no está en el catálogo no gasta número', async () => {
    const author = await scenario.quality();
    const response = await scenario.post(
      '/v1/documents',
      author.session,
      await scenario.documentBody(author, { doc_type: 'ZZ' }),
    );
    expect(errorCode(response)).toBe('DOC_REFERENCE_INVALID');
  });
});

describe('documento nuevo', () => {
  it('nace con su versión 00 en borrador y el PDF listo si la fuente es PDF', async () => {
    const author = await scenario.quality();
    const id = await scenario.createDocument(author);
    const document = await scenario.document(author, id);
    const [version] = await scenario.versions(author, id);
    expect(document.status).toBe('draft');
    expect(document.open_version?.label).toBe('00');
    expect(version?.status).toBe('draft');
    expect(version?.render_status).toBe('ready');
    expect(version?.actions).toEqual(['edit', 'submit']);
  });
});

describe('ciclo de la versión', () => {
  it('borrador → revisión → aprobada → vigente, con quién aprobó y desde cuándo rige', async () => {
    const author = await scenario.quality('elabora');
    const approver = await scenario.quality('aprueba');
    const id = await scenario.createDocument(author);
    const current = await scenario.publishLatest(author, approver, id);
    expect(current.status).toBe('current');
    expect(current.approved_by?.id).toBe(approver.id);
    expect(current.effective_date).not.toBeNull();
    const document = await scenario.document(author, id);
    expect(document.status).toBe('current');
    expect(document.current_version?.id).toBe(current.id);
  });

  it('devolver lleva el motivo y deja el borrador editable', async () => {
    const author = await scenario.quality('elabora');
    const reviewer = await scenario.quality('revisa');
    const id = await scenario.createDocument(author);
    await scenario.step(author, await scenario.latest(author, id), 'submit');
    const note = 'Falta el alcance del procedimiento';
    const back = await scenario.step(reviewer, await scenario.latest(reviewer, id), 'reject', {
      note,
    });
    expect(back.status, back.text).toBe(204);
    const draft = await scenario.latest(author, id);
    expect(draft.status).toBe('draft');
    expect(draft.review_note).toBe(note);
  });
});

describe('ciclo de la versión: quién da cada paso', () => {
  it('quien elabora no aprueba ni devuelve su propia versión', async () => {
    const author = await scenario.quality('elabora');
    const id = await scenario.createDocument(author);
    await scenario.step(author, await scenario.latest(author, id), 'submit');
    const inReview = await scenario.latest(author, id);
    expect(errorCode(await scenario.step(author, inReview, 'approve'))).toBe('DOC_SELF_APPROVAL');
    const note = { note: 'Me devuelvo a mí mismo' };
    expect(errorCode(await scenario.step(author, inReview, 'reject', note))).toBe(
      'DOC_SELF_APPROVAL',
    );
  });

  it('un paso fuera de orden no se acepta', async () => {
    const author = await scenario.quality('elabora');
    const approver = await scenario.quality('aprueba');
    const id = await scenario.createDocument(author);
    const draft = await scenario.latest(author, id);
    expect(errorCode(await scenario.step(approver, draft, 'publish'))).toBe(
      'DOC_TRANSITION_NOT_ALLOWED',
    );
  });
});

describe('solo existe una versión vigente por documento (criterio del bloque)', () => {
  it('publicar la 01 deja obsoleta la 00', async () => {
    const author = await scenario.quality('elabora');
    const approver = await scenario.quality('aprueba');
    const id = await scenario.createDocument(author);
    const first = await scenario.publishLatest(author, approver, id);
    await scenario.newVersion(author, id, { title: 'Control de documentos v2' });
    const second = await scenario.publishLatest(author, approver, id);
    const versions = await scenario.versions(approver, id);
    expect(versions.map((v) => [v.label, v.status])).toEqual([
      ['01', 'current'],
      ['00', 'obsolete'],
    ]);
    const document = await scenario.document(approver, id);
    expect(document.current_version?.id).toBe(second.id);
    expect(document.title).toBe('Control de documentos v2');
    expect(first.id).not.toBe(second.id);
  });
});

describe('solo una vigente, también en la base de datos', () => {
  it('la base de datos rechaza una segunda vigente aunque el código se equivoque', async () => {
    const author = await scenario.quality('elabora');
    const approver = await scenario.quality('aprueba');
    const id = await scenario.createDocument(author);
    const current = await scenario.publishLatest(author, approver, id);
    const at = scenario.clock.now();
    const forced = scenario.inTenant((tx) =>
      tx.docVersion.create({
        data: {
          tenantId: scenario.tenant.id,
          documentId: id,
          number: 9,
          versionLabel: '09',
          status: 'current',
          sourceFileId: current.source_file?.id ?? '',
          pdfFileId: current.pdf_file?.id ?? null,
          renderStatus: 'ready',
          title: 'Intrusa',
          classification: 'internal',
          changeSummary: 'Forzada',
          submittedAt: at,
          approvedBy: approver.id,
          approvedAt: at,
          publishedAt: at,
          effectiveDate: at,
        },
      }),
    );
    // El disparador responde «unique_violation», que Prisma informa como restricción única.
    await expect(forced).rejects.toThrow(/Unique constraint/u);
  });
});
