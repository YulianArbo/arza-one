import { createdResponseSchema } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { RetentionScenario } from './support/retention-scenario.js';

// Criterio de B21: la búsqueda nunca devuelve un documento que la persona no puede abrir. Búsqueda
// de texto completo en español y sin tildes sobre el código, el título y el texto del PDF vigente
// (que extrae el worker), filtrada con la misma regla de acceso del resto del módulo.

const scenario = new RetentionScenario('búsqueda de documentos');
let author: Person;
let approver: Person;

/** Una palabra que solo existe en esta prueba, para no ver documentos de otras. */
function word(label: string): string {
  return `${label}${String(Math.floor(Math.random() * 1_000_000_000))}`;
}

function ids(hits: readonly { id: string }[]): string[] {
  return hits.map((hit) => hit.id);
}

/** Da a las personas el permiso nominal «Ver documentos restringidos», además de su rol. */
async function grantRestricted(people: readonly Person[]): Promise<Person[]> {
  const admin = await scenario.person('admin-busqueda', ['ADMIN_PLATAFORMA']);
  const role = await scenario.post('/v1/roles', admin.session, {
    name: `Restringidos ${word('busqueda')}`,
    audience: 'internal',
    permissions: [{ code: 'doc.restricted.read', scope: 'all' }],
  });
  expect(role.status, role.text).toBe(201);
  const roleId = createdResponseSchema.parse(role.body).id;
  const granted: Person[] = [];
  for (const person of people) {
    const body = { role_id: roleId };
    const assigned = await scenario.post(`/v1/users/${person.id}/roles`, admin.session, body);
    expect(assigned.status, assigned.text).toBe(201);
    granted.push(await scenario.refresh(person));
  }
  return granted;
}

beforeAll(async () => {
  await scenario.seed();
  author = await scenario.quality('elabora-busqueda');
  approver = await scenario.quality('aprueba-busqueda');
});

describe('texto completo', () => {
  it('encuentra el texto del PDF vigente, sin tildes y por el comienzo de la palabra', async () => {
    const unique = word('auditoria');
    const id = await scenario.publishedWithText(
      author,
      approver,
      `Procedimiento de Gestión de la ${unique} interna`,
    );
    expect(await scenario.search(author, unique)).toEqual([]);
    expect(await scenario.extractTexts()).toBeGreaterThanOrEqual(1);
    const [hit] = await scenario.search(author, `gestion ${unique}`);
    expect(hit?.id).toBe(id);
    expect(hit?.snippet).toContain(`[[${unique}]]`);
    expect(ids(await scenario.search(author, unique.slice(0, 12)))).toContain(id);
    expect(await scenario.auditActions((await scenario.latest(author, id)).id)).toContain(
      'doc.version.text',
    );
  });

  it('encuentra por el código y por el título', async () => {
    const title = word('Manual');
    const id = await scenario.createDocument(author, { title });
    const document = await scenario.document(author, id);
    expect(ids(await scenario.search(author, document.code))).toContain(id);
    expect(ids(await scenario.search(author, document.code.slice(0, 6)))).toContain(id);
    expect(ids(await scenario.search(author, title.toLowerCase()))).toContain(id);
  });
});

describe('texto completo: entradas y PDF sin texto', () => {
  it('lo que escribe la persona nunca llega como operador de búsqueda', async () => {
    for (const q of ['&|!()', "x' OR 1=1 --", 'a:* & !b', '%%']) {
      const response = await scenario.get(
        `/v1/documents/search?q=${encodeURIComponent(q)}`,
        author.session,
      );
      expect(response.status, response.text).toBe(200);
    }
    const tooShort = await scenario.get('/v1/documents/search?q=a', author.session);
    expect(tooShort.status).toBe(422);
  });

  it('un PDF sin texto se busca solo por su código y su título', async () => {
    const title = word('Escaneado');
    const id = await scenario.createDocument(author, { title });
    await scenario.publishLatest(author, approver, id);
    await scenario.extractTexts();
    const stored = await scenario.inTenant((tx) =>
      tx.docVersionText.findFirstOrThrow({ where: { documentId: id } }),
    );
    expect(stored.status).toBe('failed');
    const [hit] = await scenario.search(author, title);
    expect(hit).toMatchObject({ id, snippet: null });
  });
});

describe('nunca un documento que la persona no puede abrir', () => {
  it('el Colaborador no ve borradores ajenos ni vigentes de otro proceso', async () => {
    const unique = word('colaboracion');
    const draft = await scenario.createDocument(author, { title: `Borrador ${unique}` });
    const ownProcess = await scenario.publishedWithText(author, approver, `Texto ${unique}`);
    const otherProcess = await scenario.publishedWithText(author, approver, `Texto ${unique}`, {
      folder_id: await scenario.folderId('SGC-COM'),
      process_id: await scenario.processId('COM'),
    });
    await scenario.extractTexts();
    const collaborator = await scenario.person('colaborador-busqueda', ['COLABORADOR']);
    await scenario.placeInProcess(collaborator.id, 'SGC');
    const found = ids(await scenario.search(collaborator, unique));
    expect(found).toContain(ownProcess);
    expect(found).not.toContain(draft);
    expect(found).not.toContain(otherProcess);
    expect(ids(await scenario.search(author, unique))).toEqual(
      expect.arrayContaining([draft, ownProcess, otherProcess]),
    );
  });
});

describe('nunca un documento que la persona no puede abrir: restringidos', () => {
  it('lo restringido solo aparece con su permiso, y sin fragmento de su texto', async () => {
    const unique = word('reservado');
    const [reader, checker] = await grantRestricted([
      await scenario.quality('elabora-restringido'),
      await scenario.quality('revisa-restringido'),
      await scenario.director(),
    ]);
    if (reader === undefined || checker === undefined) throw new Error('Faltan lectores.');
    const id = await scenario.publishedWithText(reader, checker, `Informe ${unique}`, {
      classification: 'restricted',
    });
    await scenario.extractTexts();
    const commercial = await scenario.person('comercial-busqueda', ['COMERCIAL']);
    expect(ids(await scenario.search(commercial, unique))).not.toContain(id);
    expect(ids(await scenario.search(author, unique))).not.toContain(id);
    const [hit] = await scenario.search(reader, unique);
    expect(hit).toMatchObject({ id, snippet: null });
  });
});

/** Lleva el documento por toda la disposición final: obsoleto, vencido, propuesto y eliminado. */
async function disposeOf(id: string): Promise<void> {
  const request = await scenario.approvedRequest(author, { action: 'obsolete', documentId: id });
  const current = await scenario.latest(approver, id);
  const body = { reason: 'Ya no aplica', change_request_id: request };
  expect((await scenario.step(approver, current, 'obsolete', body)).status).toBe(204);
  await scenario.age(id, 10);
  const proposalId = (await scenario.propose(author)).proposal_id ?? '';
  expect((await scenario.dispositionStep(author, proposalId, 'send')).status).toBe(204);
  const director = await scenario.director();
  expect((await scenario.dispositionStep(director, proposalId, 'approve')).status).toBe(204);
  await scenario.execute();
}

describe('nunca un documento que la persona no puede abrir: eliminados', () => {
  it('un documento eliminado por disposición final no aparece', async () => {
    const unique = word('eliminado');
    await scenario.rule(author, { doc_type: 'PR' });
    const id = await scenario.publishedWithText(author, approver, `Registro ${unique}`);
    await scenario.extractTexts();
    expect(ids(await scenario.search(author, unique))).toContain(id);
    await disposeOf(id);
    expect(await scenario.search(author, unique)).toEqual([]);
    const text = await scenario.inTenant((tx) =>
      tx.docVersionText.findFirstOrThrow({ where: { documentId: id } }),
    );
    expect(text).toMatchObject({ status: 'disposed', content: '' });
  });
});

describe('nunca un documento que la persona no puede abrir: otras empresas y permisos', () => {
  it('otra empresa no encuentra los documentos de esta', async () => {
    const unique = word('aislado');
    const id = await scenario.publishedWithText(author, approver, `Política ${unique}`);
    await scenario.extractTexts();
    const outsider = await scenario.quality('calidad-otra-empresa', scenario.otherTenant.id);
    expect(ids(await scenario.search(outsider, unique))).not.toContain(id);
    expect(ids(await scenario.search(author, unique))).toContain(id);
  });

  it('sin permiso de ver documentos o desde el portal no hay búsqueda', async () => {
    const people = [
      await scenario.person('sin-rol-busqueda', []),
      await scenario.person('portal-busqueda', ['CLIENTE_ADMIN'], { kind: 'portal' }),
    ];
    for (const person of people) {
      const response = await scenario.get('/v1/documents/search?q=gestion', person.session);
      expect(errorCode(response)).toBe('PERMISSION_DENIED');
    }
  });
});
