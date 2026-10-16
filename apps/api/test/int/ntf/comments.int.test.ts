import { commentListSchema, createdResponseSchema, type RecordRef } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { errorCode } from '../iam/support/iam-fixtures.js';
import type { Person } from '../iam/support/access-scenario.js';
import { NtfScenario } from './support/ntf-scenario.js';

// Comentarios con menciones en cualquier registro (B16, ficha 17.5): quién comenta, quién lee,
// quién retira, aislamiento entre empresas, auditoría y el aviso de cada mención.

const scenario = new NtfScenario('comentarios');

function query(ref: RecordRef): string {
  return `/v1/comments?entity_type=${ref.entity_type}&entity_id=${ref.entity_id}`;
}

async function comment(person: Person, ref: RecordRef, body: object = {}): Promise<string> {
  const response = await scenario.post('/v1/comments', person.session, {
    ...ref,
    body: 'Revisé el RUT y está al día.',
    ...body,
  });
  expect(response.status, response.text).toBe(201);
  return createdResponseSchema.parse(response.body).id;
}

describe('comentar un tercero con menciones', () => {
  it('el comentario se lista con su autor y la mención produce un aviso', async () => {
    const { ref, owner } = await scenario.party();
    const mentioned = await scenario.people('mencionado', ['COLABORADOR']);
    const id = await comment(owner, ref, { mention_emails: [mentioned.email] });
    const list = commentListSchema.parse((await scenario.get(query(ref), owner.session)).body);
    expect(list.items.map((item) => item.id)).toContain(id);
    const mine = list.items.find((item) => item.id === id);
    expect(mine?.author?.id).toBe(owner.id);
    expect(mine?.mentions.map((person) => person.id)).toEqual([mentioned.id]);
    expect(mine?.can_delete).toBe(true);
    await scenario.publishOutbox();
    const notices = await scenario.inTenant((tx) =>
      tx.notification.findMany({ where: { userId: mentioned.id, kind: 'comment_mention' } }),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]?.body).toContain('Revisé el RUT y está al día.');
    expect(notices[0]?.link).toBe(`/app/terceros/${ref.entity_id}`);
    expect(await scenario.actionsBy(owner)).toContain('ntf.comment.create');
  });

  it('no se menciona a uno mismo, al portal, a otra empresa ni a un correo desconocido', async () => {
    const { ref, owner } = await scenario.party();
    const portal = await scenario.person('portal-mencion', ['CLIENTE_ADMIN'], { kind: 'portal' });
    const outsider = await scenario.people('externo', ['COLABORADOR'], scenario.otherTenant.id);
    const unknown = 'nadie@demo.test';
    for (const email of [owner.email, portal.email, outsider.email, unknown]) {
      const response = await scenario.post('/v1/comments', owner.session, {
        ...ref,
        body: 'Hola',
        mention_emails: [email],
      });
      expect(errorCode(response)).toBe('NTF_MENTION_INVALID');
    }
  });
});

describe('permiso denegado en los comentarios', () => {
  it('quien no puede trabajar en el registro no comenta; quien no lo ve no lo lee', async () => {
    const { ref, owner } = await scenario.party();
    await comment(owner, ref);
    const director = await scenario.people('director', ['DIRECCION']);
    expect((await scenario.get(query(ref), director.session)).status).toBe(200);
    const write = await scenario.post('/v1/comments', director.session, { ...ref, body: 'Hola' });
    expect(errorCode(write)).toBe('PERMISSION_DENIED');
    const sst = await scenario.people('sst', ['SST']);
    expect(errorCode(await scenario.get(query(ref), sst.session))).toBe('PERMISSION_DENIED');
  });

  it('solo quien escribió el comentario lo retira, y el retiro queda en la auditoría', async () => {
    const { ref, owner } = await scenario.party();
    const id = await comment(owner, ref);
    const colleague = await scenario.people('colega-finanzas', ['ADMIN_FINANCIERO']);
    expect(errorCode(await scenario.delete(`/v1/comments/${id}`, colleague.session))).toBe(
      'PERMISSION_DENIED',
    );
    expect((await scenario.delete(`/v1/comments/${id}`, owner.session)).status).toBe(204);
    const list = commentListSchema.parse((await scenario.get(query(ref), owner.session)).body);
    expect(list.items.map((item) => item.id)).not.toContain(id);
    expect(errorCode(await scenario.delete(`/v1/comments/${id}`, owner.session))).toBe(
      'NTF_COMMENT_NOT_FOUND',
    );
    expect(await scenario.actionsBy(owner)).toContain('ntf.comment.delete');
  });
});

describe('comentarios en un trámite', () => {
  it('participa quien participa en el trámite; el auditor lee pero no comenta', async () => {
    const admin = await scenario.admin();
    const flow = await scenario.publish(admin);
    const requester = await scenario.people('solicitante', ['COLABORADOR']);
    const instance = await scenario.startAs(requester, flow.key);
    const ref: RecordRef = { entity_type: 'wf_instance', entity_id: instance };
    await comment(requester, ref);
    const stranger = await scenario.people('ajeno', ['COLABORADOR']);
    expect(errorCode(await scenario.get(query(ref), stranger.session))).toBe(
      'NTF_RECORD_NOT_FOUND',
    );
    const auditor = await scenario.people('auditor', ['AUDITOR']);
    expect((await scenario.get(query(ref), auditor.session)).status).toBe(200);
    const write = await scenario.post('/v1/comments', auditor.session, { ...ref, body: 'Hola' });
    expect(errorCode(write)).toBe('PERMISSION_DENIED');
  });
});

describe('aislamiento entre empresas', () => {
  it('la otra empresa no ve, ni comenta, ni retira los comentarios de esta', async () => {
    const { ref, owner } = await scenario.party();
    const id = await comment(owner, ref);
    const outsider = await scenario.people(
      'finanzas-b',
      ['ADMIN_FINANCIERO'],
      scenario.otherTenant.id,
    );
    expect(errorCode(await scenario.get(query(ref), outsider.session))).toBe(
      'NTF_RECORD_NOT_FOUND',
    );
    const write = await scenario.post('/v1/comments', outsider.session, { ...ref, body: 'Hola' });
    expect(errorCode(write)).toBe('NTF_RECORD_NOT_FOUND');
    expect(errorCode(await scenario.delete(`/v1/comments/${id}`, outsider.session))).toBe(
      'NTF_COMMENT_NOT_FOUND',
    );
  });
});
