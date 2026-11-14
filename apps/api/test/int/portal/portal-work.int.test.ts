import {
  portalDocumentListSchema,
  portalHomeSchema,
  portalProjectDetailSchema,
  portalSignatureListSchema,
  portalSigningLinkSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { PortalScenario, type ClientWorld } from './support/portal-scenario.js';

// El portal del cliente en funcionamiento (B30, ficha 17.10): el inicio con lo pendiente, el avance
// del proyecto sin dinero ni horas, firmar el acta desde el portal con el enlace de un solo uso (que
// pide el código del correo y deja inservible el enlace anterior), los documentos compartidos y la
// auditoría de cada paso. Datos ficticios.

const scenario = new PortalScenario('portal: trabajo');

async function signatures(world: ClientWorld) {
  return portalSignatureListSchema.parse(await scenario.read(world.admin, '/v1/portal/signatures'));
}

/** Firma con la llave del enlace del portal: pide el código, lo valida y firma. */
async function signWithToken(token: string, email: string): Promise<void> {
  expect((await scenario.publicSign('code', { token })).status).toBe(204);
  await scenario.signatureWork();
  const code = /es: ([0-9]{6})/u.exec(scenario.lastMailTo(email).text)?.[1] ?? '';
  const verified = await scenario.publicSign('verify-code', { token, code });
  expect(verified.status, verified.text).toBe(200);
  const ticket = (verified.body as { ticket: string }).ticket;
  const signed = await scenario.publicSign('sign', { token, ticket, accept: true });
  expect(signed.status, signed.text).toBe(204);
}

describe('inicio y avance', () => {
  it('el inicio muestra lo pendiente y el proyecto no muestra dinero ni horas', async () => {
    const world = await scenario.clientWorld();
    const deliverableId = await scenario.deliveredDeliverable(world);
    const home = portalHomeSchema.parse(await scenario.read(world.admin, '/v1/portal/home'));
    expect(home).toMatchObject({ projects: 1, pending: { approvals: 1, signatures: 1 } });
    expect(home.next_milestones.map((row) => row.name)).toEqual(['Entrega del portal']);
    const raw = await scenario.read<Record<string, unknown>>(
      world.admin,
      `/v1/portal/projects/${world.projectId}`,
    );
    const project = portalProjectDetailSchema.parse(raw);
    expect(project.deliverables.map((row) => [row.id, row.acceptance?.status])).toEqual([
      [deliverableId, 'in_signature'],
    ]);
    for (const hidden of ['budget_amount', 'budget_hours', 'hour_cost', 'members', 'manager']) {
      expect(raw).not.toHaveProperty(hidden);
    }
  });
});

describe('firmar desde el portal', () => {
  it('el enlace del portal firma el acta y deja inservible el del correo', async () => {
    const world = await scenario.clientWorld();
    await scenario.deliveredDeliverable(world);
    const pending = (await signatures(world)).pending;
    expect(pending.map((row) => [row.kind, row.my_turn, row.can_sign])).toEqual([
      ['acceptance', true, true],
    ]);
    const signerEmail = world.client.signers[0]?.email ?? '';
    const mailed = scenario.linkOf(signerEmail);
    const response = await scenario.portalPost(
      world.admin,
      `/v1/portal/signatures/${pending[0]?.id ?? ''}/link`,
    );
    expect(response.status, response.text).toBe(201);
    const { url } = portalSigningLinkSchema.parse(response.body);
    const token = /#token=([A-Za-z0-9_-]+)/u.exec(url)?.[1] ?? '';
    expect(url).toContain('/firmar#token=');
    expect((await scenario.publicSign('code', { token: mailed })).status).toBe(404);
    await signWithToken(token, signerEmail);
    const signed = await signatures(world);
    expect(signed.pending).toHaveLength(0);
    expect(signed.recent).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: pending[0]?.id, my_turn: false })]),
    );
    expect(await scenario.auditedActions(world.admin)).toContain('signature.link.issue');
  });
});

describe('firmar: solo quien le toca', () => {
  it('otro administrador del mismo cliente no recibe enlace para la firma ajena', async () => {
    const world = await scenario.clientWorld();
    await scenario.deliveredDeliverable(world);
    const colleague = await scenario.readyPerson('CLIENTE_ADMIN', world.client.partyId);
    const pending = portalSignatureListSchema.parse(
      await scenario.read(colleague, '/v1/portal/signatures'),
    ).pending;
    expect(pending.map((row) => [row.my_turn, row.can_sign])).toEqual([[false, false]]);
    const path = `/v1/portal/signatures/${pending[0]?.id ?? ''}/link`;
    expect((await scenario.portalPost(colleague, path)).status).toBe(409);
  });
});

describe('documentos compartidos', () => {
  it('el cliente ve y descarga el contrato firmado y lo compartido, y la descarga queda registrada', async () => {
    const world = await scenario.clientWorld();
    const fileId = await scenario.signedCopy(world.leader);
    const share = { file_id: fileId, title: 'Manual de usuario' };
    const sharedId = await scenario.create(
      `/v1/projects/${world.projectId}/shared-files`,
      world.leader,
      share,
    );
    const again = await scenario.portalPost(
      world.leader,
      `/v1/projects/${world.projectId}/shared-files`,
      share,
    );
    expect(again.status).toBe(409);
    const documents = portalDocumentListSchema.parse(
      await scenario.read(world.admin, '/v1/portal/documents'),
    );
    expect(documents.data.map((row) => row.kind).sort()).toEqual(['contract', 'shared']);
    const contract = documents.data.find((row) => row.kind === 'contract');
    if (contract === undefined) throw new Error('No aparece el contrato');
    const contractPath = `/v1/portal/documents/contract/${contract.id}/link`;
    expect((await scenario.portalPost(world.admin, contractPath)).status).toBe(201);
    expect((await scenario.portalPost(world.user, contractPath)).status).toBe(404);
    const userDocs = portalDocumentListSchema.parse(
      await scenario.read(world.user, '/v1/portal/documents'),
    );
    expect(userDocs.data).toHaveLength(0);
    const link = await scenario.portalPost(
      world.admin,
      `/v1/portal/documents/shared/${sharedId}/link`,
    );
    expect(link.status, link.text).toBe(201);
    expect(await scenario.auditedActions(world.admin)).toContain('doc.file.download_link');
    expect(await scenario.auditActionsOf(sharedId)).toEqual(['project.file.share']);
  });
});

it('entrega el enlace del contrato firmado desde la ficha de contratos', async () => {
  const world = await scenario.clientWorld();
  const contracts = await scenario.read<{ data: { id: string }[] }>(
    world.admin,
    '/v1/portal/contracts',
  );
  const contract = contracts.data[0];
  if (contract === undefined) throw new Error('No aparece el contrato');
  const path = `/v1/portal/contracts/${contract.id}/link`;
  expect((await scenario.portalPost(world.user, path)).status).toBe(403);
  const link = await scenario.portalPost(world.admin, path);
  expect(link.status, link.text).toBe(201);
});

describe('dejar de compartir', () => {
  it('lo que el equipo deja de compartir ya no se ve ni se descarga', async () => {
    const world = await scenario.clientWorld();
    const fileId = await scenario.signedCopy(world.leader);
    const path = `/v1/projects/${world.projectId}/shared-files`;
    const sharedId = await scenario.create(path, world.leader, {
      file_id: fileId,
      title: 'Acta de reunión',
    });
    const removed = await scenario.delete(`${path}/${sharedId}`, world.leader.session);
    expect(removed.status, removed.text).toBe(204);
    expect((await scenario.delete(`${path}/${sharedId}`, world.leader.session)).status).toBe(404);
    const link = await scenario.portalPost(
      world.admin,
      `/v1/portal/documents/shared/${sharedId}/link`,
    );
    expect(link.status).toBe(404);
    const developer = await scenario.developer();
    const denied = await scenario.portalPost(developer, path, { file_id: fileId, title: 'Otro' });
    expect(denied.status).toBe(403);
  });
});

it('lista los archivos compartidos y rechaza compartir un archivo inexistente', async () => {
  const world = await scenario.clientWorld();
  const path = `/v1/projects/${world.projectId}/shared-files`;
  const invalid = await scenario.portalPost(world.leader, path, {
    file_id: '00000000-0000-4000-8000-000000000001',
    title: 'Archivo inexistente',
  });
  expect(invalid.status).toBe(422);
  const fileId = await scenario.signedCopy(world.leader);
  const id = await scenario.create(path, world.leader, {
    file_id: fileId,
    title: 'Manual técnico',
  });
  const list = await scenario.get(path, world.leader.session);
  expect(list.status, list.text).toBe(200);
  expect(JSON.stringify(list.body)).toContain(id);
});
