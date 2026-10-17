import { beforeAll, describe, expect, it } from 'vitest';

import { ConversionRejectedError } from '../../../src/modules/doc/infrastructure/gotenberg-converter.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { DocScenario, wordFile } from './support/doc-scenario.js';

// Un documento vigente no puede modificarse (criterio del bloque, ficha 17.4): ni por la API ni en
// la base de datos. Además, una versión a la vez y la conversión de Word a PDF.

const scenario = new DocScenario('documentos inmutables');

beforeAll(async () => {
  await scenario.seed();
});

async function publishedDocument() {
  const author = await scenario.quality('elabora');
  const approver = await scenario.quality('aprueba');
  const id = await scenario.createDocument(author);
  const current = await scenario.publishLatest(author, approver, id);
  return { author, approver, id, current };
}

describe('un documento vigente no puede modificarse (criterio del bloque)', () => {
  it('la API no deja editar la versión vigente', async () => {
    const { author, current } = await publishedDocument();
    const response = await scenario.patch(
      `/v1/versions/${current.id}`,
      author.session,
      {
        title: 'Cambio sin versión nueva',
        classification: 'internal',
        owner_position_id: null,
        source_file_id: current.source_file?.id ?? '',
        change_summary: 'Intento',
      },
      current.version,
    );
    expect(errorCode(response)).toBe('DOC_VERSION_NOT_EDITABLE');
  });

  it('la base de datos rechaza cambiar el contenido de la vigente', async () => {
    const { current } = await publishedDocument();
    const change = scenario.inTenant((tx) =>
      tx.docVersion.update({ where: { id: current.id }, data: { title: 'Alterada' } }),
    );
    await expect(change).rejects.toThrow(/no se puede cambiar/u);
  });
});

describe('un documento vigente no puede modificarse: base de datos y borradores ajenos', () => {
  it('la base de datos rechaza cambiar los datos del documento sin una versión nueva', async () => {
    const { id } = await publishedDocument();
    const change = scenario.inTenant((tx) =>
      tx.docDocument.update({ where: { id }, data: { title: 'Título cambiado a mano' } }),
    );
    await expect(change).rejects.toThrow(/solo cambia con una versión nueva/u);
    const recode = scenario.inTenant((tx) =>
      tx.docDocument.update({ where: { id }, data: { code: 'PR-SGC-999' } }),
    );
    await expect(recode).rejects.toThrow(/no cambian/u);
  });

  it('otra persona no edita el borrador ajeno', async () => {
    const author = await scenario.quality('elabora');
    const other = await scenario.quality('otra');
    const id = await scenario.createDocument(author);
    const draft = await scenario.latest(author, id);
    const body = {
      title: 'Lo cambio yo',
      classification: 'internal',
      owner_position_id: null,
      source_file_id: await scenario.sourceFile(other),
      change_summary: 'Ajeno',
    };
    const response = await scenario.patch(`/v1/versions/${draft.id}`, other.session, body, 1);
    expect(errorCode(response)).toBe('DOC_VERSION_NOT_EDITABLE');
  });
});

describe('una versión a la vez', () => {
  it('no se crea otra versión mientras una está en trámite', async () => {
    const { author, id } = await publishedDocument();
    await scenario.newVersion(author, id);
    const response = await scenario.post(`/v1/documents/${id}/versions`, author.session, {
      title: 'Otra más',
      classification: 'internal',
      owner_position_id: null,
      source_file_id: await scenario.sourceFile(author),
      change_summary: 'Segunda en trámite',
    });
    expect(errorCode(response)).toBe('DOC_VERSION_IN_PROGRESS');
  });

  it('el borrador del documento sin publicar corrige también sus datos', async () => {
    const author = await scenario.quality('elabora');
    const id = await scenario.createDocument(author);
    const draft = await scenario.latest(author, id);
    const response = await scenario.patch(
      `/v1/versions/${draft.id}`,
      author.session,
      {
        title: 'Título corregido',
        classification: 'confidential',
        owner_position_id: null,
        source_file_id: draft.source_file?.id ?? '',
        change_summary: 'Creación del documento',
      },
      draft.version,
    );
    expect(response.status, response.text).toBe(204);
    const document = await scenario.document(author, id);
    expect([document.title, document.classification]).toEqual(['Título corregido', 'confidential']);
  });
});

describe('conversión del archivo fuente a PDF', () => {
  it('un Word queda convirtiendo y no se envía a revisión hasta tener su PDF', async () => {
    const author = await scenario.quality('elabora');
    const source = await scenario.sourceFile(author, wordFile());
    const id = await scenario.createDocument(author, { source_file_id: source });
    const pending = await scenario.latest(author, id);
    expect(pending.render_status).toBe('pending');
    expect(pending.actions).toEqual(['edit']);
    expect(errorCode(await scenario.step(author, pending, 'submit'))).toBe(
      'DOC_TRANSITION_NOT_ALLOWED',
    );
    expect(await scenario.render(pending.id)).toBe('ready');
    const ready = await scenario.latest(author, id);
    expect(ready.render_status).toBe('ready');
    expect(ready.pdf_file?.file_name).toBe('Procedimiento.pdf');
    expect(ready.pdf_file?.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(await scenario.render(pending.id)).toBe('skipped');
  });

  it('si el archivo no se puede convertir, la versión queda «fallida»', async () => {
    const author = await scenario.quality('elabora');
    const source = await scenario.sourceFile(author, wordFile());
    const id = await scenario.createDocument(author, { source_file_id: source });
    const pending = await scenario.latest(author, id);
    const result = await scenario.render(pending.id, () =>
      Promise.reject(new ConversionRejectedError(400)),
    );
    expect(result).toBe('failed');
    expect((await scenario.latest(author, id)).render_status).toBe('failed');
  });
});
