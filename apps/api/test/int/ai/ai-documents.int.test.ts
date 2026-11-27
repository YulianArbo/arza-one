import { AI_ERROR_CODES, createdResponseSchema } from '@arza/contracts';
import { beforeAll, describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { RetentionScenario } from '../doc/support/retention-scenario.js';
import {
  ask,
  assist,
  auditActions,
  answerOf,
  enable,
  refreshIndex,
  requestRow,
} from './support/ai-fixture.js';

// Criterio de la ficha 17.21: un usuario no obtiene por el asistente información que no puede ver
// por la aplicación. El asistente busca y resume solo documentos vigentes que la persona puede abrir,
// nunca los restringidos, cita sus fuentes y cada uso queda registrado sin su texto (B47).

const scenario = new RetentionScenario('asistente documentos');
let author: Person;
let approver: Person;
let officer: Person;

function word(label: string): string {
  return `${label}${String(Math.floor(Math.random() * 1_000_000_000))}`;
}

/** Da a la persona el permiso nominal «Ver documentos restringidos», además de su rol. */
async function withRestricted(person: Person): Promise<Person> {
  const admin = await scenario.person('admin-asistente', ['ADMIN_PLATAFORMA']);
  const role = await scenario.post('/v1/roles', admin.session, {
    name: `Restringidos ${word('asistente')}`,
    audience: 'internal',
    permissions: [{ code: 'doc.restricted.read', scope: 'all' }],
  });
  expect(role.status, role.text).toBe(201);
  const roleId = createdResponseSchema.parse(role.body).id;
  const body = { role_id: roleId };
  const assigned = await scenario.post(`/v1/users/${person.id}/roles`, admin.session, body);
  expect(assigned.status, assigned.text).toBe(201);
  return scenario.refresh(person);
}

/** Un documento vigente con su texto extraído e indexado para el asistente. */
async function indexedDocument(text: string, overrides: Record<string, unknown> = {}) {
  const id = await scenario.publishedWithText(author, approver, text, overrides);
  await scenario.extractTexts();
  await refreshIndex(scenario);
  return id;
}

beforeAll(async () => {
  await scenario.seed();
  // Quien elabora y aprueba ve también lo restringido: así se prueba que el asistente lo excluye.
  author = await withRestricted(await scenario.quality('elabora-asistente'));
  approver = await withRestricted(await scenario.quality('aprueba-asistente'));
  // La Dirección también aprueba los documentos restringidos del trámite (B19).
  await withRestricted(await scenario.director());
  officer = await scenario.person('oficial-asistente', ['OFICIAL_DATOS']);
  await enable(scenario, officer, ['doc_search', 'doc_summary']);
});

describe('preguntas sobre los documentos', () => {
  it('responde citando solo documentos que la persona puede abrir', async () => {
    const unique = word('conciliacion');
    const visible = await indexedDocument(`Instructivo de ${unique}. Se concilia cada mes.`);
    const hidden = await indexedDocument(`Reserva de ${unique} restringida.`, {
      classification: 'restricted',
    });
    const answer = await ask(scenario, author, `¿Cómo se hace la ${unique}?`);
    expect(answer).toMatchObject({ outcome: 'answered', rehearsal: true });
    expect(answer.sources.map((source) => source.id)).toEqual([visible]);
    // La palabra de prueba termina en nueve dígitos: la minimización los borra antes de enviar.
    expect(answer.text).toContain('Se concilia cada mes');
    expect(answer.text).not.toContain(unique);
    const chunks = await scenario.inTenant((tx) =>
      tx.aiIndexChunk.count({ where: { documentId: hidden } }),
    );
    expect(chunks).toBe(0);
    const row = await requestRow(scenario, answer.request_id);
    expect(row).toMatchObject({
      useCase: 'doc_search',
      provider: 'rehearsal',
      outcome: 'answered',
      inputClass: 'internal',
      sources: [{ kind: 'document', id: visible }],
    });
    expect(Object.keys(row)).not.toContain('text');
    expect(await auditActions(scenario, answer.request_id)).toContain('ai.request.create');
  });

  it('quien no ve el documento en la aplicación tampoco lo ve por el asistente', async () => {
    const unique = word('vacaciones');
    await indexedDocument(`Política de ${unique} del área de calidad.`);
    const worker = await scenario.person('colaborador-asistente', ['COLABORADOR']);
    expect(await scenario.search(worker, unique)).toEqual([]);
    const answer = await ask(scenario, worker, `¿Qué dice la política de ${unique}?`);
    expect(answer).toMatchObject({ outcome: 'no_sources', sources: [] });
    expect(answer.text).toContain('No encontré');
  });
});

describe('resumen de un documento', () => {
  it('resume el documento vigente y lo cita', async () => {
    const id = await indexedDocument(`Procedimiento ${word('compras')}. Paso uno. Paso dos.`);
    const answer = answerOf(await assist(scenario, author, 'doc_summary', id));
    expect(answer).toMatchObject({ outcome: 'answered', truncated: false });
    expect(answer.sources).toEqual([expect.objectContaining({ kind: 'document', id })]);
  });

  it('un documento restringido nunca va al asistente y el intento queda bloqueado', async () => {
    const reader = author;
    const id = await indexedDocument(`Expediente ${word('reservado')}.`, {
      classification: 'restricted',
    });
    const response = await assist(scenario, reader, 'doc_summary', id);
    expect(response.status, response.text).toBe(422);
    expect(errorCode(response)).toBe(AI_ERROR_CODES.sourceExcluded);
    const blocked = await scenario.inTenant((tx) =>
      tx.aiRequest.findFirstOrThrow({ where: { targetId: id } }),
    );
    expect(blocked).toMatchObject({ outcome: 'blocked', inputChars: 0, userId: reader.id });
  });

  it('otra persona u otra empresa no resume lo que no puede ver', async () => {
    const id = await indexedDocument(`Manual ${word('ventas')}.`);
    const worker = await scenario.person('colaborador-resumen', ['COLABORADOR']);
    expect((await assist(scenario, worker, 'doc_summary', id)).status).toBe(404);
    const stranger = await scenario.person('ajeno-resumen', ['CALIDAD'], {
      tenantId: scenario.otherTenant.id,
    });
    const other = await scenario.person('oficial-ajeno', ['OFICIAL_DATOS'], {
      tenantId: scenario.otherTenant.id,
    });
    await enable(scenario, other, ['doc_summary']);
    expect((await assist(scenario, stranger, 'doc_summary', id)).status).toBe(404);
  });
});

describe('índice del asistente', () => {
  it('saca los fragmentos de un documento que pasó a restringido', async () => {
    const id = await indexedDocument(`Guía ${word('indice')}.`);
    const count = () =>
      scenario.inTenant((tx) => tx.aiIndexChunk.count({ where: { documentId: id } }));
    expect(await count()).toBeGreaterThan(0);
    await scenario.newVersion(author, id, { classification: 'restricted' });
    await scenario.publishLatest(author, approver, id);
    expect((await refreshIndex(scenario)).removed).toBeGreaterThan(0);
    expect(await count()).toBe(0);
    expect(await auditActions(scenario, scenario.tenant.id)).toContain('ai.index.update');
  });
});
