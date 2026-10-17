import { createServer, type Server } from 'node:http';

import { documentListResponseSchema } from '@arza/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { convertWithGotenberg } from '../../../src/modules/doc/index.js';
import { ConversionRejectedError } from '../../../src/modules/doc/infrastructure/gotenberg-converter.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { DocScenario, wordFile } from './support/doc-scenario.js';

// Casos límite de documentos (B18): filtros y páginas de la lista, referencias inválidas, una
// conversión que llega tarde y las respuestas de Gotenberg.

const scenario = new DocScenario('documentos límites');

beforeAll(async () => {
  await scenario.seed();
});

describe('lista de documentos', () => {
  it('filtra por texto y estado y pasa de página sin repetir', async () => {
    const author = await scenario.quality();
    const approver = await scenario.quality('aprueba');
    const first = await scenario.createDocument(author, { title: 'Manual de búsqueda alfa' });
    await scenario.createDocument(author, { title: 'Manual de búsqueda beta' });
    await scenario.publishLatest(author, approver, first);
    const page = async (query: string) =>
      documentListResponseSchema.parse(
        (await scenario.get(`/v1/documents?${query}`, author.session)).body,
      );
    const found = await page('q=b%C3%BAsqueda&limit=1');
    expect(found.data).toHaveLength(1);
    const next = await page(`q=b%C3%BAsqueda&limit=1&cursor=${found.next_cursor ?? ''}`);
    expect(next.data[0]?.id).not.toBe(found.data[0]?.id);
    expect(next.next_cursor).toBeNull();
    const current = await page('q=alfa&status=current');
    expect(current.data.map((doc) => doc.id)).toEqual([first]);
  });
});

describe('referencias inválidas', () => {
  it('rechaza un proceso que es un área, un cargo inexistente y una imagen como fuente', async () => {
    const author = await scenario.quality();
    const area = await scenario.inTenant((tx) =>
      tx.orgUnit.create({
        data: {
          tenantId: scenario.tenant.id,
          code: `AR${String(Date.now()).slice(-6)}`,
          name: 'Área',
          kind: 'area',
        },
      }),
    );
    const post = async (overrides: Record<string, unknown>) =>
      scenario.post(
        '/v1/documents',
        author.session,
        await scenario.documentBody(author, overrides),
      );
    expect(errorCode(await post({ process_id: area.id }))).toBe('DOC_REFERENCE_INVALID');
    expect(errorCode(await post({ owner_position_id: scenario.tenant.id }))).toBe(
      'DOC_REFERENCE_INVALID',
    );
    const image = await scenario.sourceFile(author, {
      name: 'foto.png',
      type: 'image/png',
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]),
    });
    expect(errorCode(await post({ source_file_id: image }))).toBe('DOC_SOURCE_INVALID');
  });
});

async function wordDraft() {
  const author = await scenario.quality();
  const id = await scenario.createDocument(author, {
    source_file_id: await scenario.sourceFile(author, wordFile()),
  });
  return { author, id, pending: await scenario.latest(author, id) };
}

describe('conversión que llega tarde', () => {
  it('si el borrador cambió de archivo mientras se convertía, el PDF se descarta', async () => {
    const { author, id, pending } = await wordDraft();
    const replacement = await scenario.sourceFile(author, wordFile());
    const result = await scenario.render(pending.id, async () => {
      const replaced = await scenario.patch(
        `/v1/versions/${pending.id}`,
        author.session,
        {
          title: pending.title,
          classification: 'internal',
          owner_position_id: null,
          source_file_id: replacement,
          change_summary: pending.change_summary,
        },
        pending.version,
      );
      expect(replaced.status, replaced.text).toBe(204);
      return Buffer.from('%PDF-1.7 tarde');
    });
    expect(result).toBe('skipped');
    expect((await scenario.latest(author, id)).render_status).toBe('pending');
  });

  it('un PDF vacío deja la versión «fallida»', async () => {
    const { pending } = await wordDraft();
    expect(await scenario.render(pending.id, () => Promise.resolve(Buffer.alloc(0)))).toBe(
      'failed',
    );
  });
});

describe('cliente de Gotenberg', () => {
  let server: Server;
  let status = 200;
  let url = '';

  beforeAll(async () => {
    server = createServer((request, response) => {
      request.resume();
      request.on('end', () => {
        response.statusCode = status;
        response.end(status === 200 ? '%PDF-1.7 convertido' : 'error');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Sin puerto.');
    url = `http://127.0.0.1:${String(address.port)}`;
  });

  afterAll(() => {
    server.close();
  });

  const source = { fileName: 'a.docx', mimeType: 'application/msword', content: Buffer.from('x') };

  it('devuelve el PDF, con o sin barra final en la dirección', async () => {
    status = 200;
    const pdf = await convertWithGotenberg({ url: `${url}/`, timeoutMs: 5000 }, source);
    expect(pdf.toString()).toBe('%PDF-1.7 convertido');
    expect((await convertWithGotenberg({ url, timeoutMs: 5000 }, source)).length).toBeGreaterThan(
      0,
    );
  });

  it('un 4xx es un archivo que no se puede convertir; un 5xx se reintenta', async () => {
    status = 400;
    await expect(convertWithGotenberg({ url, timeoutMs: 5000 }, source)).rejects.toBeInstanceOf(
      ConversionRejectedError,
    );
    status = 503;
    await expect(convertWithGotenberg({ url, timeoutMs: 5000 }, source)).rejects.toThrow(/503/u);
  });
});
