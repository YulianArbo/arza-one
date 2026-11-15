import { ASSET_BOOK_COLUMNS } from '@arza/contracts';
import type { Response } from 'supertest';
import { describe, expect, it } from 'vitest';

import { assetsHeldBy } from '../../../src/modules/asset/index.js';
import { createdId, versioned } from '../fin/support/ledger-steps.js';
import { auditActions, errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { ASSETS, ASSIGNMENTS, AssetScenario, type AssetTeam } from './support/asset-scenario.js';

// Criterios del B34: «Todo activo asignado tiene comodato firmado» y «El libro coincide con
// RE-ADM-003». Quien administra registra el activo y lo asigna; la plataforma llena el CT-ADM-001,
// genera su PDF y lo envía a firma del colaborador (enlace y código). Solo al firmar, la asignación
// queda vigente y el activo «asignado». Datos ficticios.

const s = new AssetScenario('activos');

let prepared: AssetTeam | undefined;

async function team(): Promise<AssetTeam> {
  prepared ??= await s.assetTeam('recorrido');
  return prepared;
}

function expectError(response: Response, status: number, code: string): void {
  expect(response.status, response.text).toBe(status);
  expect(errorCode(response)).toBe(code);
}

async function expectPendingSignature(t: AssetTeam, assetId: string): Promise<void> {
  const { asset } = await s.assetDetail(t.manager, assetId);
  expect(asset.status).toBe('reserved');
  expect(asset.assignment).toMatchObject({ status: 'in_signature', contract_document_id: null });
  expect(asset.assignment?.record_code).toMatch(/^CT-ADM-001-\d{4}-\d{4}$/u);
  expect(asset.assignment?.envelope_code).toMatch(/^FE-\d{4}-\d{4}$/u);
  expectError(await s.retire(t.manager, assetId), 409, 'AST_STATUS_INVALID');
  expectError(await s.assign(t.manager, assetId, t.holder), 409, 'AST_STATUS_INVALID');
}

async function expectBookRow(t: AssetTeam, code: string): Promise<void> {
  const response = await s.post(`${ASSETS}/book/export`, t.auditor.session, {});
  expect(response.status, response.text).toBe(200);
  expect(response.headers['content-type']).toContain('text/csv');
  const lines = response.text.replace('﻿', '').trimEnd().split('\r\n');
  expect(lines[0]).toBe(ASSET_BOOK_COLUMNS.join(';'));
  const row = lines.find((line) => line.startsWith(`${code};`));
  expect(row).toContain(';Asignado;');
  expect(row).toMatch(/;CT-ADM-001-\d{4}-\d{4};$/u);
}

describe('asignación en comodato con contrato firmado (CT-ADM-001)', () => {
  it('el activo solo queda asignado cuando el colaborador firma el comodato', async () => {
    const t = await team();
    const assetId = await s.newAsset(t.manager);
    const created = await s.assetDetail(t.manager, assetId);
    expect(created.asset).toMatchObject({ status: 'available', assignment: null });
    expect(created.asset.code).toMatch(/^ACT-\d{4}-\d{4}$/u);
    expect(Number(created.asset.accumulated_depreciation)).toBeGreaterThan(0);

    const assignmentId = await s.sentToSign(t, assetId);
    await expectPendingSignature(t, assetId);

    await s.clientSigns(t.holder.email);
    expect((await s.loanWork()).answered).toBe(1);
    const { asset, assignments } = await s.assetDetail(t.manager, assetId);
    expect(asset.status).toBe('assigned');
    expect(asset.assignment?.status).toBe('active');
    expect(asset.assignment?.contract_document_id).not.toBeNull();
    expect(assignments).toHaveLength(1);
    await expectBookRow(t, asset.code);
    expect(await auditActions(s.db, s.tenant.id, assignmentId)).toEqual([
      'asset.assignment.create:success',
      'asset.assignment.send:success',
      'asset.assignment.activate:success',
    ]);
  });
});

describe('devolución y baja de un activo asignado', () => {
  it('la devolución libera el activo y entonces se puede dar de baja', async () => {
    const t = await team();
    const assetId = await s.newAsset(t.manager);
    await s.signedAssignment(t, assetId);
    const held = await tenantScope(s.db, s.tenant.id)((tx) => assetsHeldBy(tx, t.holder.id));
    expect(held.map((row) => row.assetId)).toContain(assetId);
    expectError(await s.retire(t.manager, assetId), 409, 'AST_STATUS_INVALID');

    expect((await s.giveBack(t.manager, assetId)).status).toBe(204);
    const returned = await s.assetDetail(t.manager, assetId);
    expect(returned.asset).toMatchObject({ status: 'available', assignment: null });
    expect(returned.assignments[0]).toMatchObject({ status: 'returned' });

    expect((await s.retire(t.manager, assetId)).status).toBe(204);
    const retired = await s.assetDetail(t.manager, assetId);
    expect(retired.asset).toMatchObject({ status: 'retired', retire_reason: 'obsolescence' });
    expectError(await s.assign(t.manager, assetId, t.holder), 409, 'AST_STATUS_INVALID');
    expect(await auditActions(s.db, s.tenant.id, assetId)).toEqual([
      'asset.create:success',
      'asset.retire:success',
    ]);
  });
});

describe('comodato sin firmar', () => {
  it('la base de datos no deja «asignado» un activo sin comodato firmado', async () => {
    const t = await team();
    const assetId = await s.newAsset(t.manager);
    const forced = tenantScope(
      s.db,
      s.tenant.id,
    )((tx) => tx.astAsset.update({ where: { id: assetId }, data: { status: 'assigned' } }));
    await expect(forced).rejects.toThrow();
    await s.sentToSign(t, assetId);
    const open = await s.openAssignment(t.manager, assetId);
    const unsigned = tenantScope(
      s.db,
      s.tenant.id,
    )((tx) => tx.astAssignment.update({ where: { id: open.id }, data: { status: 'active' } }));
    await expect(unsigned).rejects.toThrow();
  });
});

describe('comodato rechazado', () => {
  it('si el colaborador rechaza el comodato, la asignación se anula y el activo queda libre', async () => {
    const t = await team();
    const assetId = await s.newAsset(t.manager);
    await s.sentToSign(t, assetId);
    const { token, ticket } = await s.ticketFor(t.holder.email);
    const reason = 'El equipo no corresponde al que recibí.';
    expect((await s.publicSign('reject', { token, ticket, reason })).status).toBe(204);
    expect((await s.loanWork()).answered).toBe(1);
    const { asset, assignments } = await s.assetDetail(t.manager, assetId);
    expect(asset).toMatchObject({ status: 'available', assignment: null });
    expect(assignments[0]?.status).toBe('cancelled');
    expect(assignments[0]?.closed_reason).toContain(reason);
  });
});

describe('anulación antes de la firma', () => {
  it('quien asigna puede anular antes de la firma, con su motivo', async () => {
    const t = await team();
    const assetId = await s.newAsset(t.manager);
    await s.sentToSign(t, assetId);
    const open = await s.openAssignment(t.manager, assetId);
    const path = `${ASSIGNMENTS}/${open.id}/cancellation`;
    const body = { reason: 'Se asignó al colaborador equivocado.' };
    expectError(
      await versioned(s.post(path, t.manager.session, {}), open.version),
      422,
      'VALIDATION_FAILED',
    );
    const cancelled = await versioned(s.post(path, t.manager.session, body), open.version);
    expect(cancelled.status, cancelled.text).toBe(204);
    expect((await s.assetDetail(t.manager, assetId)).asset.status).toBe('available');
    expectError(
      await versioned(s.post(path, t.manager.session, body), open.version + 1),
      409,
      'AST_STATUS_INVALID',
    );
  });
});

describe('a quién se asigna', () => {
  it('exige un colaborador activo vinculado con su persona y su documento', async () => {
    const t = await team();
    const assetId = await s.newAsset(t.manager);
    expectError(await s.assign(t.manager, assetId, t.unlinked), 422, 'AST_HOLDER_NOT_READY');
    const future = { user_id: t.holder.id, assigned_on: s.day(3), message: null };
    const path = `${ASSETS}/${assetId}/assignments`;
    const late = s
      .post(path, t.manager.session, future)
      .set('Idempotency-Key', crypto.randomUUID());
    expectError(await late, 422, 'AST_RECORD_INVALID');
    const options = await s.get('/v1/asset-assignees', t.manager.session);
    expect(options.status, options.text).toBe(200);
    const rows = (options.body as { data: { id: string; ready: boolean }[] }).data;
    expect(rows.find((row) => row.id === t.holder.id)?.ready).toBe(true);
    expect(rows.find((row) => row.id === t.unlinked.id)?.ready).toBe(false);
    expect((await s.assetDetail(t.manager, assetId)).asset.status).toBe('available');
  });

  it('repetir la asignación con la misma llave no crea otra', async () => {
    const t = await team();
    const assetId = await s.newAsset(t.manager);
    const key = crypto.randomUUID();
    const body = { user_id: t.holder.id, assigned_on: s.day(0), message: null };
    const path = `${ASSETS}/${assetId}/assignments`;
    const first = await createdId(
      s.post(path, t.manager.session, body).set('Idempotency-Key', key),
    );
    const again = await createdId(
      s.post(path, t.manager.session, body).set('Idempotency-Key', key),
    );
    expect(again).toBe(first);
    expect((await s.assetDetail(t.manager, assetId)).assignments).toHaveLength(1);
  });
});
